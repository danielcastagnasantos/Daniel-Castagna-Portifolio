-- =====================================================================
-- 0002_finance_core — contas, categorias, rotas de pagamento e LIVRO-RAZÃO
-- =====================================================================
-- Princípios do livro-razão (ledger_entries):
--   * Imutável. Correção = lançamento de estorno (reverses_entry_id).
--   * Cada lançamento pertence a UMA conta e tem valor com sinal
--     (+ aumenta o saldo da conta, − diminui).
--   * `nature` separa o que é faturamento/despesa do que é só movimento
--     entre contas. Transferência NÃO é receita nem despesa.
--   * (source_type, source_id, leg) é único: o mesmo fato econômico não
--     pode ser lançado duas vezes (ex.: boleto pago no caixa físico gera
--     um só lançamento, e não um do boleto + um da retirada).

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (length(trim(name)) between 2 and 80),
  type text not null check (type in ('cash_drawer', 'safe', 'bank', 'pix', 'card_receivable')),
  bank_name text check (length(bank_name) <= 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index accounts_org_name_uidx on public.accounts (organization_id, lower(name));
create index accounts_org_idx on public.accounts (organization_id);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (length(trim(name)) between 2 and 60),
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index categories_org_name_uidx on public.expense_categories (organization_id, lower(name), kind);

-- Forma de pagamento -> conta que recebe (dinheiro usa a conta da gaveta).
create table public.payment_routes (
  organization_id uuid not null references public.organizations (id),
  payment_method text not null check (payment_method in ('pix', 'debito', 'credito', 'transferencia')),
  account_id uuid not null references public.accounts (id),
  primary key (organization_id, payment_method)
);

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id),
  account_id uuid not null references public.accounts (id),
  amount_cents bigint not null check (amount_cents <> 0),
  nature text not null check (nature in (
    'opening_balance', 'revenue', 'refund', 'other_income', 'expense', 'fee',
    'transfer', 'contribution', 'withdrawal', 'cash_difference', 'adjustment')),
  category_id uuid references public.expense_categories (id),
  description text check (length(description) <= 250),
  occurred_at timestamptz not null default now(),
  occurred_on date not null,
  group_id uuid not null,
  source_type text not null,
  source_id uuid not null,
  leg smallint not null default 1,
  is_reversal boolean not null default false,
  reverses_entry_id bigint unique references public.ledger_entries (id),
  shift_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint ledger_reversal_consistency check (is_reversal = (reverses_entry_id is not null))
);
create unique index ledger_source_uidx on public.ledger_entries
  (organization_id, source_type, source_id, leg, is_reversal);
create index ledger_org_day_idx on public.ledger_entries (organization_id, occurred_on);
create index ledger_account_idx on public.ledger_entries (account_id, occurred_at desc);
create index ledger_group_idx on public.ledger_entries (group_id);

create trigger ledger_immutable before update or delete on public.ledger_entries
  for each row execute function private.deny_mutation();
create trigger ledger_no_truncate before truncate on public.ledger_entries
  for each statement execute function private.deny_mutation();

create trigger accounts_touch before update on public.accounts
  for each row execute function private.touch_updated_at();
create trigger accounts_audit after insert or update on public.accounts
  for each row execute function private.audit_row('account');
create trigger categories_audit after insert or update on public.expense_categories
  for each row execute function private.audit_row('expense_category');
create trigger routes_audit after insert or update or delete on public.payment_routes
  for each row execute function private.audit_row('payment_route');

-- Saldo por conta (view com RLS do chamador).
create view public.account_balances with (security_invoker = true) as
  select a.id as account_id, a.organization_id, a.name, a.type, a.bank_name, a.active,
         coalesce(sum(l.amount_cents), 0)::bigint as balance_cents,
         count(l.id)::int as entries_count
  from public.accounts a
  left join public.ledger_entries l on l.account_id = a.id
  group by a.id;

-- ---------------------------------------------------------------------
-- Lançamento interno (único ponto que escreve no razão)
-- ---------------------------------------------------------------------
create function private.post_entry(
  p_org uuid, p_account uuid, p_amount bigint, p_nature text,
  p_source_type text, p_source_id uuid, p_leg smallint, p_group uuid,
  p_description text default null, p_category uuid default null,
  p_shift uuid default null, p_occurred_at timestamptz default now()
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if p_amount = 0 then return null; end if;
  insert into public.ledger_entries (
    organization_id, account_id, amount_cents, nature, category_id, description,
    occurred_at, occurred_on, group_id, source_type, source_id, leg, shift_id, created_by)
  values (
    p_org, p_account, p_amount, p_nature, p_category, left(p_description, 250),
    p_occurred_at, private.local_date(p_org, p_occurred_at), p_group,
    p_source_type, p_source_id, p_leg, p_shift, (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

-- Estorna todos os lançamentos de uma origem, criando entradas inversas.
create function private.reverse_source(
  p_org uuid, p_source_type text, p_source_id uuid, p_reason text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare r public.ledger_entries%rowtype; n integer := 0; v_group uuid := gen_random_uuid();
begin
  for r in
    select * from public.ledger_entries
    where organization_id = p_org and source_type = p_source_type and source_id = p_source_id
      and not is_reversal
      and not exists (select 1 from public.ledger_entries x where x.reverses_entry_id = ledger_entries.id)
    order by id
  loop
    insert into public.ledger_entries (
      organization_id, account_id, amount_cents, nature, category_id, description,
      occurred_at, occurred_on, group_id, source_type, source_id, leg, is_reversal,
      reverses_entry_id, shift_id, created_by)
    values (
      r.organization_id, r.account_id, -r.amount_cents, r.nature, r.category_id,
      left('ESTORNO: ' || coalesce(p_reason, ''), 250), now(), private.local_date(p_org),
      v_group, r.source_type, r.source_id, r.leg, true, r.id, r.shift_id, (select auth.uid()));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Conta que recebe uma forma de pagamento.
create function private.account_for_method(p_org uuid, p_method text, p_cash_account uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_acc uuid;
begin
  if p_method = 'dinheiro' then return p_cash_account; end if;
  select account_id into v_acc from public.payment_routes
  where organization_id = p_org and payment_method = p_method;
  if v_acc is null then
    perform private.fail('Forma de pagamento sem conta configurada. Defina em Configurações > Contas', 'NO_ROUTE');
  end if;
  return v_acc;
end $$;

-- ---------------------------------------------------------------------
-- Contas (RPC)
-- ---------------------------------------------------------------------
create function public.create_account(
  p_name text, p_type text, p_opening_cents bigint default 0,
  p_bank_name text default null, p_opening_date date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid := gen_random_uuid();
begin
  v_org := private.require_admin();
  if p_type not in ('safe', 'bank', 'pix', 'card_receivable') then
    perform private.fail('Tipo inválido. A gaveta é criada ao cadastrar o caixa', 'INVALID'); end if;
  if p_opening_cents is null or p_opening_cents < -100000000000 or p_opening_cents > 100000000000 then
    perform private.fail('Saldo inicial inválido', 'INVALID'); end if;
  begin
    insert into public.accounts (id, organization_id, name, type, bank_name)
    values (v_id, v_org, trim(p_name), p_type, nullif(trim(coalesce(p_bank_name, '')), ''));
  exception when unique_violation then
    perform private.fail('Já existe uma conta com este nome', 'DUPLICATE');
  end;
  if p_opening_cents <> 0 then
    perform private.post_entry(v_org, v_id, p_opening_cents, 'opening_balance', 'account_opening', v_id,
      1::smallint, gen_random_uuid(), 'Saldo inicial da conta', null, null,
      coalesce(p_opening_date, private.local_date(v_org))::timestamp at time zone
        (select timezone from public.organizations where id = v_org));
  end if;
  return v_id;
end $$;

create function public.set_account_active(p_account_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_acc public.accounts%rowtype;
begin
  v_org := private.require_admin();
  select * into v_acc from public.accounts where id = p_account_id and organization_id = v_org for update;
  if not found then perform private.fail('Conta não encontrada', 'NOT_FOUND'); end if;
  if v_acc.type = 'cash_drawer' then
    perform private.fail('A gaveta é ativada/desativada pelo cadastro de caixas', 'FORBIDDEN'); end if;
  if not p_active and exists (select 1 from public.payment_routes where account_id = p_account_id) then
    perform private.fail('Esta conta recebe uma forma de pagamento. Escolha outra conta antes de desativar', 'IN_USE'); end if;
  update public.accounts set active = p_active where id = p_account_id;
end $$;

create function public.rename_account(p_account_id uuid, p_name text, p_bank_name text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_admin();
  begin
    update public.accounts set name = trim(p_name), bank_name = nullif(trim(coalesce(p_bank_name, '')), '')
    where id = p_account_id and organization_id = v_org;
  exception when unique_violation then
    perform private.fail('Já existe uma conta com este nome', 'DUPLICATE');
  end;
  if not found then perform private.fail('Conta não encontrada', 'NOT_FOUND'); end if;
end $$;

create function public.set_payment_route(p_method text, p_account_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_type text;
begin
  v_org := private.require_admin();
  select type into v_type from public.accounts
  where id = p_account_id and organization_id = v_org and active;
  if v_type is null then perform private.fail('Conta inválida ou inativa', 'INVALID'); end if;
  if v_type = 'cash_drawer' then perform private.fail('Esta forma de pagamento não pode cair na gaveta', 'INVALID'); end if;
  if p_method = 'pix' and v_type not in ('pix', 'bank') then perform private.fail('Pix deve cair em conta Pix ou bancária', 'INVALID'); end if;
  if p_method in ('debito', 'credito') and v_type <> 'card_receivable' then
    perform private.fail('Cartão deve cair em uma conta "Cartão a receber"', 'INVALID'); end if;
  if p_method = 'transferencia' and v_type not in ('bank', 'pix') then
    perform private.fail('Transferência deve cair em conta bancária', 'INVALID'); end if;
  insert into public.payment_routes (organization_id, payment_method, account_id)
  values (v_org, p_method, p_account_id)
  on conflict (organization_id, payment_method) do update set account_id = excluded.account_id;
end $$;

-- ---------------------------------------------------------------------
-- Transferência entre contas (NÃO é receita nem despesa)
-- ---------------------------------------------------------------------
create table public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  from_account_id uuid not null references public.accounts (id),
  to_account_id uuid not null references public.accounts (id),
  amount_cents bigint not null check (amount_cents > 0),
  kind text not null default 'transfer' check (kind in ('transfer', 'card_settlement')),
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  note text check (length(note) <= 250),
  occurred_on date not null,
  status text not null default 'posted' check (status in ('posted', 'cancelled')),
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  client_request_id uuid not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check (from_account_id <> to_account_id),
  check (fee_cents < amount_cents)
);
create unique index transfers_request_uidx on public.account_transfers (organization_id, client_request_id);
create index transfers_org_idx on public.account_transfers (organization_id, occurred_on desc);
create trigger transfers_audit after insert or update on public.account_transfers
  for each row execute function private.audit_row('account_transfer');

-- Só é permitido alterar o cancelamento.
create function private.guard_transfer_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then perform private.immutable_violation(); end if;
  if (to_jsonb(new) - 'status' - 'cancelled_by' - 'cancelled_at' - 'cancel_reason')
     is distinct from (to_jsonb(old) - 'status' - 'cancelled_by' - 'cancelled_at' - 'cancel_reason')
     or old.status = 'cancelled' then
    perform private.immutable_violation();
  end if;
  return new;
end $$;
create trigger transfers_guard before update or delete on public.account_transfers
  for each row execute function private.guard_transfer_update();

create function public.transfer_between_accounts(
  p_from uuid, p_to uuid, p_amount_cents bigint, p_note text, p_occurred_on date, p_request_id uuid,
  p_kind text default 'transfer', p_fee_cents bigint default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_id uuid := gen_random_uuid(); v_group uuid := gen_random_uuid();
  v_from public.accounts%rowtype; v_to public.accounts%rowtype; v_existing uuid;
  v_ts timestamptz; v_cat uuid;
begin
  v_org := private.require_admin();
  select id into v_existing from public.account_transfers
  where organization_id = v_org and client_request_id = p_request_id;
  if found then return v_existing; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000000 then
    perform private.fail('Valor inválido', 'INVALID'); end if;
  if p_from = p_to then perform private.fail('Origem e destino devem ser diferentes', 'INVALID'); end if;
  select * into v_from from public.accounts where id = p_from and organization_id = v_org and active;
  select * into v_to from public.accounts where id = p_to and organization_id = v_org and active;
  if v_from.id is null or v_to.id is null then perform private.fail('Conta inválida ou inativa', 'INVALID'); end if;
  if v_from.type = 'cash_drawer' or v_to.type = 'cash_drawer' then
    perform private.fail('Movimentos da gaveta devem ser feitos como sangria ou suprimento dentro do turno', 'CASH_DRAWER');
  end if;
  if p_kind not in ('transfer', 'card_settlement') then perform private.fail('Tipo inválido', 'INVALID'); end if;
  if p_kind = 'card_settlement' and (v_from.type <> 'card_receivable' or v_to.type not in ('bank', 'pix')) then
    perform private.fail('Liquidação de cartão: origem "Cartão a receber" e destino conta bancária', 'INVALID'); end if;
  if p_fee_cents < 0 or p_fee_cents >= p_amount_cents or (p_kind = 'transfer' and p_fee_cents <> 0) then
    perform private.fail('Taxa inválida', 'INVALID'); end if;
  if p_occurred_on is null or p_occurred_on > private.local_date(v_org) then
    perform private.fail('A data não pode estar no futuro', 'INVALID'); end if;
  v_ts := p_occurred_on::timestamp at time zone (select timezone from public.organizations where id = v_org);
  if p_occurred_on = private.local_date(v_org) then v_ts := now(); end if;
  begin
    insert into public.account_transfers (id, organization_id, from_account_id, to_account_id, amount_cents,
      kind, fee_cents, note, occurred_on, client_request_id, created_by)
    values (v_id, v_org, p_from, p_to, p_amount_cents, p_kind, p_fee_cents, left(p_note, 250), p_occurred_on,
      p_request_id, private.uid());
  exception when unique_violation then
    select id into v_existing from public.account_transfers where organization_id = v_org and client_request_id = p_request_id;
    return v_existing;
  end;
  perform private.post_entry(v_org, p_from, -p_amount_cents, 'transfer', 'account_transfer', v_id, 1::smallint, v_group,
    coalesce(p_note, 'Transferência'), null, null, v_ts);
  perform private.post_entry(v_org, p_to, p_amount_cents, 'transfer', 'account_transfer', v_id, 2::smallint, v_group,
    coalesce(p_note, 'Transferência'), null, null, v_ts);
  if p_fee_cents > 0 then
    select id into v_cat from public.expense_categories
      where organization_id = v_org and lower(name) = 'taxas de cartão' and kind = 'expense' limit 1;
    perform private.post_entry(v_org, p_to, -p_fee_cents, 'fee', 'account_transfer', v_id, 3::smallint, v_group,
      'Taxa de liquidação de cartão', v_cat, null, v_ts);
  end if;
  return v_id;
end $$;

create function public.cancel_account_transfer(p_transfer_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_t public.account_transfers%rowtype;
begin
  v_org := private.require_admin();
  if length(trim(coalesce(p_reason, ''))) < 5 then perform private.fail('Informe o motivo do cancelamento', 'REASON_REQUIRED'); end if;
  select * into v_t from public.account_transfers where id = p_transfer_id and organization_id = v_org for update;
  if not found then perform private.fail('Transferência não encontrada', 'NOT_FOUND'); end if;
  if v_t.status = 'cancelled' then return; end if;
  perform private.reverse_source(v_org, 'account_transfer', v_t.id, p_reason);
  update public.account_transfers set status = 'cancelled', cancelled_by = private.uid(),
    cancelled_at = now(), cancel_reason = trim(p_reason) where id = v_t.id;
end $$;

-- Ajuste manual de saldo (correção auditável). Nunca na gaveta.
create table public.account_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  account_id uuid not null references public.accounts (id),
  amount_cents bigint not null check (amount_cents <> 0),
  reason text not null check (length(trim(reason)) >= 10),
  created_by uuid not null,
  client_request_id uuid not null,
  created_at timestamptz not null default now()
);
create unique index adjustments_request_uidx on public.account_adjustments (organization_id, client_request_id);
create trigger adjustments_immutable before update or delete on public.account_adjustments
  for each row execute function private.deny_mutation();
create trigger adjustments_audit after insert on public.account_adjustments
  for each row execute function private.audit_row('account_adjustment');

create function public.post_account_adjustment(p_account_id uuid, p_amount_cents bigint, p_reason text, p_request_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid := gen_random_uuid(); v_type text; v_existing uuid;
begin
  v_org := private.require_admin();
  select id into v_existing from public.account_adjustments where organization_id = v_org and client_request_id = p_request_id;
  if found then return v_existing; end if;
  select type into v_type from public.accounts where id = p_account_id and organization_id = v_org and active;
  if v_type is null then perform private.fail('Conta inválida', 'INVALID'); end if;
  if v_type = 'cash_drawer' then
    perform private.fail('Ajustes da gaveta são feitos por movimentação dentro de um turno', 'CASH_DRAWER'); end if;
  if p_amount_cents = 0 or abs(p_amount_cents) > 100000000000 then perform private.fail('Valor inválido', 'INVALID'); end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    perform private.fail('Descreva o motivo do ajuste (mínimo 10 caracteres)', 'REASON_REQUIRED'); end if;
  begin
    insert into public.account_adjustments (id, organization_id, account_id, amount_cents, reason, created_by, client_request_id)
    values (v_id, v_org, p_account_id, p_amount_cents, trim(p_reason), private.uid(), p_request_id);
  exception when unique_violation then
    select id into v_existing from public.account_adjustments where organization_id = v_org and client_request_id = p_request_id;
    return v_existing;
  end;
  perform private.post_entry(v_org, p_account_id, p_amount_cents, 'adjustment', 'account_adjustment', v_id, 1::smallint,
    gen_random_uuid(), 'Ajuste manual: ' || trim(p_reason));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.accounts enable row level security;
alter table public.expense_categories enable row level security;
alter table public.payment_routes enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.account_transfers enable row level security;
alter table public.account_adjustments enable row level security;

revoke all on public.accounts, public.expense_categories, public.payment_routes, public.ledger_entries,
  public.account_transfers, public.account_adjustments, public.account_balances from anon, authenticated;
grant select on public.accounts, public.expense_categories, public.payment_routes, public.ledger_entries,
  public.account_transfers, public.account_adjustments, public.account_balances to authenticated;

-- Saldos e razão: somente administração (operador não vê saldo bancário).
create policy accounts_read on public.accounts for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy routes_read on public.payment_routes for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy ledger_read on public.ledger_entries for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy transfers_read on public.account_transfers for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy adjustments_read on public.account_adjustments for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
-- Categorias são necessárias no lançamento de despesa do operador.
create policy categories_read on public.expense_categories for select to authenticated
  using (organization_id = (select private.current_org_id()));

-- Cadastro de categorias (gestão)
create function public.upsert_category(p_id uuid, p_name text, p_kind text, p_active boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid;
begin
  v_org := private.require_admin();
  if p_kind not in ('expense', 'income') then perform private.fail('Tipo inválido', 'INVALID'); end if;
  begin
    if p_id is null then
      insert into public.expense_categories (organization_id, name, kind, active)
      values (v_org, trim(p_name), p_kind, coalesce(p_active, true)) returning id into v_id;
    else
      update public.expense_categories set name = trim(p_name), active = coalesce(p_active, true)
      where id = p_id and organization_id = v_org returning id into v_id;
      if v_id is null then perform private.fail('Categoria não encontrada', 'NOT_FOUND'); end if;
    end if;
  exception when unique_violation then
    perform private.fail('Já existe uma categoria com este nome', 'DUPLICATE');
  end;
  return v_id;
end $$;
