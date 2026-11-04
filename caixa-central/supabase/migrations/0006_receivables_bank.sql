-- =====================================================================
-- 0006_receivables_bank — contas a receber e conciliação de extratos
-- =====================================================================

-- ---------------------------------------------------------------------
-- Contas a receber (títulos de clientes). O "cartão a receber" é saldo de
-- conta, não título: aparece no painel separado.
-- ---------------------------------------------------------------------
create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  customer text not null check (length(trim(customer)) between 2 and 140),
  description text check (length(description) <= 250),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'received', 'cancelled')),
  received_on date,
  received_account_id uuid references public.accounts (id),
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancel_reason text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  client_request_id uuid not null,
  constraint receivable_status_consistency check (
    (status = 'received' and received_on is not null and received_account_id is not null) or status <> 'received')
);
create unique index receivables_request_uidx on public.receivables (organization_id, client_request_id);
create index receivables_org_due_idx on public.receivables (organization_id, due_date) where status = 'open';

create function private.guard_receivable_update() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_allowed text[] := array['status', 'received_on', 'received_account_id', 'cancelled_by', 'cancelled_at', 'cancel_reason'];
  v_old jsonb := to_jsonb(old); v_new jsonb := to_jsonb(new); k text;
begin
  if tg_op = 'DELETE' or old.status <> 'open' then perform private.immutable_violation(); end if;
  for k in select jsonb_object_keys(v_new) loop
    if v_old -> k is distinct from v_new -> k and not (k = any (v_allowed)) then
      perform private.immutable_violation(); end if;
  end loop;
  return new;
end $$;
create trigger receivables_guard before update or delete on public.receivables
  for each row execute function private.guard_receivable_update();
create trigger receivables_audit after insert or update on public.receivables
  for each row execute function private.audit_row('receivable');

create function public.create_receivable(
  p_customer text, p_description text, p_amount_cents bigint, p_due_date date, p_request_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid; v_existing uuid;
begin
  v_org := private.require_admin();
  select id into v_existing from public.receivables where organization_id = v_org and client_request_id = p_request_id;
  if found then return v_existing; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000000 then
    perform private.fail('Valor inválido', 'INVALID'); end if;
  begin
    insert into public.receivables (organization_id, customer, description, amount_cents, due_date, created_by, client_request_id)
    values (v_org, trim(p_customer), nullif(trim(coalesce(p_description, '')), ''), p_amount_cents, p_due_date, private.uid(), p_request_id)
    returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.receivables where organization_id = v_org and client_request_id = p_request_id;
  end;
  return v_id;
end $$;

create function public.receive_receivable(p_id uuid, p_account_id uuid, p_received_on date, p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_r public.receivables%rowtype; v_type text;
begin
  v_org := private.require_admin();
  select * into v_r from public.receivables where id = p_id and organization_id = v_org for update;
  if not found then perform private.fail('Título não encontrado', 'NOT_FOUND'); end if;
  if v_r.status = 'received' then return; end if;  -- repetição segura
  if v_r.status <> 'open' then perform private.fail('Título não está em aberto', 'NOT_OPEN'); end if;
  select type into v_type from public.accounts where id = p_account_id and organization_id = v_org and active;
  if v_type is null or v_type in ('cash_drawer', 'card_receivable') then
    perform private.fail('Escolha uma conta bancária/Pix/cofre. Recebimento em dinheiro deve ser lançado no turno do caixa', 'INVALID'); end if;
  if p_received_on is null or p_received_on > private.local_date(v_org) then
    perform private.fail('Data de recebimento inválida', 'INVALID'); end if;
  perform private.post_entry(v_org, p_account_id, v_r.amount_cents, 'revenue', 'receivable', v_r.id, 1::smallint,
    gen_random_uuid(), 'Recebimento: ' || v_r.customer, null, null,
    case when p_received_on = private.local_date(v_org) then now()
         else p_received_on::timestamp at time zone (select timezone from public.organizations where id = v_org) + interval '12 hours' end);
  update public.receivables set status = 'received', received_on = p_received_on, received_account_id = p_account_id where id = p_id;
end $$;

create function public.cancel_receivable(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_admin();
  if length(trim(coalesce(p_reason, ''))) < 5 then perform private.fail('Informe o motivo', 'REASON_REQUIRED'); end if;
  update public.receivables set status = 'cancelled', cancelled_by = private.uid(), cancelled_at = now(), cancel_reason = trim(p_reason)
  where id = p_id and organization_id = v_org and status = 'open';
  if not found then perform private.fail('Título não encontrado ou já baixado', 'NOT_FOUND'); end if;
end $$;

-- ---------------------------------------------------------------------
-- Extratos importados (CSV/OFX) e conciliação manual
-- Importar extrato NÃO lança nada no razão: as linhas servem de conferência
-- contra lançamentos já existentes. Só gera lançamento quando a linha não
-- tem correspondente (tarifa, rendimento...) e a pessoa decide criar.
-- ---------------------------------------------------------------------
create table public.bank_statement_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  account_id uuid not null references public.accounts (id),
  filename text not null check (length(filename) <= 200),
  format text not null check (format in ('csv', 'ofx')),
  file_hash text not null,
  line_count integer not null,
  imported_count integer not null,
  duplicate_count integer not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index statement_imports_hash_uidx on public.bank_statement_imports (organization_id, account_id, file_hash);

create table public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  account_id uuid not null references public.accounts (id),
  import_id uuid not null references public.bank_statement_imports (id),
  posted_on date not null,
  amount_cents bigint not null check (amount_cents <> 0),
  description text not null check (length(description) <= 300),
  fitid text,
  dedupe_key text not null,
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'created', 'ignored')),
  matched_entry_id bigint unique references public.ledger_entries (id),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  note text check (length(note) <= 250),
  created_at timestamptz not null default now(),
  constraint line_resolution_consistency check (
    (status in ('matched', 'created') and matched_entry_id is not null) or
    (status in ('unmatched', 'ignored') and matched_entry_id is null))
);
create unique index statement_lines_dedupe_uidx on public.bank_statement_lines (organization_id, account_id, dedupe_key);
create index statement_lines_account_idx on public.bank_statement_lines (account_id, posted_on desc);
create index statement_lines_open_idx on public.bank_statement_lines (organization_id, account_id) where status = 'unmatched';

create function private.guard_import_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' or (to_jsonb(new) - 'imported_count' - 'duplicate_count')
     is distinct from (to_jsonb(old) - 'imported_count' - 'duplicate_count') then
    perform private.immutable_violation();
  end if;
  return new;
end $$;
create trigger statement_imports_guard before update or delete on public.bank_statement_imports
  for each row execute function private.guard_import_update();
create trigger statement_lines_audit after insert or update on public.bank_statement_lines
  for each row execute function private.audit_row('bank_statement_line');
create trigger statement_lines_no_delete before delete on public.bank_statement_lines
  for each row execute function private.deny_mutation();

-- Quais chaves já existem (para o pré-visualizar apontar possíveis duplicidades).
create function public.statement_existing_keys(p_account_id uuid, p_keys text[]) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_admin();
  return coalesce((select array_agg(dedupe_key) from public.bank_statement_lines
    where organization_id = v_org and account_id = p_account_id and dedupe_key = any (p_keys)), '{}');
end $$;

-- p_lines: [{posted_on, amount_cents, description, fitid, key, force}]
create function public.import_bank_statement(
  p_account_id uuid, p_filename text, p_format text, p_file_hash text, p_lines jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_import uuid := gen_random_uuid(); v_total integer; v_inserted integer := 0; v_dupes integer := 0;
  l jsonb; v_key text; v_rows integer;
begin
  v_org := private.require_admin();
  if not exists (select 1 from public.accounts where id = p_account_id and organization_id = v_org
                 and type in ('bank', 'pix')) then
    perform private.fail('Escolha uma conta bancária ou Pix', 'INVALID'); end if;
  if p_format not in ('csv', 'ofx') then perform private.fail('Formato inválido', 'INVALID'); end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 5000 then
    perform private.fail('O arquivo deve ter entre 1 e 5000 linhas', 'INVALID'); end if;
  if exists (select 1 from public.bank_statement_imports where organization_id = v_org and account_id = p_account_id and file_hash = p_file_hash) then
    perform private.fail('Este mesmo arquivo já foi importado para esta conta', 'FILE_ALREADY_IMPORTED'); end if;
  v_total := jsonb_array_length(p_lines);

  insert into public.bank_statement_imports (id, organization_id, account_id, filename, format, file_hash,
    line_count, imported_count, duplicate_count, created_by)
  values (v_import, v_org, p_account_id, left(p_filename, 200), p_format, p_file_hash, v_total, 0, 0, private.uid());

  for l in select * from jsonb_array_elements(p_lines) loop
    v_key := l ->> 'key';
    if coalesce((l ->> 'force')::boolean, false) then v_key := v_key || '#' || v_import::text; end if;
    insert into public.bank_statement_lines (organization_id, account_id, import_id, posted_on, amount_cents,
      description, fitid, dedupe_key)
    values (v_org, p_account_id, v_import, (l ->> 'posted_on')::date, (l ->> 'amount_cents')::bigint,
      left(l ->> 'description', 300), l ->> 'fitid', v_key)
    on conflict (organization_id, account_id, dedupe_key) do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end loop;
  v_dupes := v_total - v_inserted;
  update public.bank_statement_imports set imported_count = v_inserted, duplicate_count = v_dupes where id = v_import;
  return jsonb_build_object('import_id', v_import, 'imported', v_inserted, 'duplicates', v_dupes);
end $$;

-- Candidatos a conciliação: mesmo valor, mesma conta, datas próximas, ainda livres.
create function public.reconciliation_candidates(p_line_id uuid)
returns table (entry_id bigint, occurred_on date, amount_cents bigint, description text, nature text, day_distance integer)
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_l public.bank_statement_lines%rowtype;
begin
  v_org := private.require_admin();
  select * into v_l from public.bank_statement_lines where id = p_line_id and organization_id = v_org;
  if not found then perform private.fail('Linha não encontrada', 'NOT_FOUND'); end if;
  return query
    select e.id, e.occurred_on, e.amount_cents, e.description, e.nature, abs(e.occurred_on - v_l.posted_on)::int
    from public.ledger_entries e
    where e.organization_id = v_org and e.account_id = v_l.account_id and e.amount_cents = v_l.amount_cents
      and not e.is_reversal
      and not exists (select 1 from public.ledger_entries x where x.reverses_entry_id = e.id)
      and not exists (select 1 from public.bank_statement_lines b where b.matched_entry_id = e.id)
      and e.occurred_on between v_l.posted_on - 7 and v_l.posted_on + 7
    order by abs(e.occurred_on - v_l.posted_on), e.id
    limit 10;
end $$;

create function public.reconcile_statement_line(p_line_id uuid, p_entry_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_l public.bank_statement_lines%rowtype; v_e public.ledger_entries%rowtype;
begin
  v_org := private.require_admin();
  select * into v_l from public.bank_statement_lines where id = p_line_id and organization_id = v_org for update;
  if not found then perform private.fail('Linha não encontrada', 'NOT_FOUND'); end if;
  if v_l.status <> 'unmatched' then perform private.fail('Esta linha já foi tratada', 'ALREADY_RESOLVED'); end if;
  select * into v_e from public.ledger_entries where id = p_entry_id and organization_id = v_org;
  if not found then perform private.fail('Lançamento não encontrado', 'NOT_FOUND'); end if;
  if v_e.account_id <> v_l.account_id then perform private.fail('O lançamento é de outra conta', 'INVALID'); end if;
  if v_e.amount_cents <> v_l.amount_cents then
    perform private.fail('Os valores são diferentes (' || private.fmt_brl(v_l.amount_cents) || ' no extrato × ' ||
      private.fmt_brl(v_e.amount_cents) || ' no sistema)', 'AMOUNT_MISMATCH'); end if;
  if v_e.is_reversal or exists (select 1 from public.ledger_entries x where x.reverses_entry_id = v_e.id) then
    perform private.fail('Este lançamento foi estornado', 'INVALID'); end if;
  if exists (select 1 from public.bank_statement_lines where matched_entry_id = p_entry_id) then
    perform private.fail('Este lançamento já foi conciliado com outra linha', 'ALREADY_MATCHED'); end if;
  update public.bank_statement_lines set status = 'matched', matched_entry_id = p_entry_id,
    resolved_by = private.uid(), resolved_at = now() where id = p_line_id;
end $$;

create function public.unreconcile_statement_line(p_line_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_l public.bank_statement_lines%rowtype;
begin
  v_org := private.require_admin();
  if length(trim(coalesce(p_reason, ''))) < 4 then perform private.fail('Informe o motivo', 'REASON_REQUIRED'); end if;
  select * into v_l from public.bank_statement_lines where id = p_line_id and organization_id = v_org for update;
  if not found then perform private.fail('Linha não encontrada', 'NOT_FOUND'); end if;
  if v_l.status = 'created' then
    perform private.fail('Esta linha gerou um lançamento. Estorne o lançamento criado em vez de desfazer', 'INVALID'); end if;
  if v_l.status = 'unmatched' then return; end if;
  update public.bank_statement_lines set status = 'unmatched', matched_entry_id = null, resolved_by = null,
    resolved_at = null, note = trim(p_reason) where id = p_line_id;
end $$;

create function public.ignore_statement_line(p_line_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_admin();
  if length(trim(coalesce(p_reason, ''))) < 4 then perform private.fail('Informe o motivo', 'REASON_REQUIRED'); end if;
  update public.bank_statement_lines set status = 'ignored', resolved_by = private.uid(), resolved_at = now(), note = trim(p_reason)
  where id = p_line_id and organization_id = v_org and status = 'unmatched';
  if not found then perform private.fail('Linha não encontrada ou já tratada', 'NOT_FOUND'); end if;
end $$;

-- Cria o lançamento que falta no razão (tarifa, rendimento, depósito não registrado...).
create function public.create_entry_from_statement_line(
  p_line_id uuid, p_nature text, p_category_id uuid, p_description text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_l public.bank_statement_lines%rowtype; v_entry bigint;
begin
  v_org := private.require_admin();
  if p_nature not in ('expense', 'fee', 'other_income', 'adjustment') then
    perform private.fail('Tipo de lançamento inválido', 'INVALID'); end if;
  if (p_nature in ('expense', 'fee')) and (select amount_cents from public.bank_statement_lines where id = p_line_id) > 0 then
    perform private.fail('Despesa/tarifa deve ser uma saída (valor negativo no extrato)', 'INVALID'); end if;
  if p_nature = 'other_income' and (select amount_cents from public.bank_statement_lines where id = p_line_id) < 0 then
    perform private.fail('Entrada deve ser valor positivo no extrato', 'INVALID'); end if;
  select * into v_l from public.bank_statement_lines where id = p_line_id and organization_id = v_org for update;
  if not found then perform private.fail('Linha não encontrada', 'NOT_FOUND'); end if;
  if v_l.status <> 'unmatched' then perform private.fail('Esta linha já foi tratada', 'ALREADY_RESOLVED'); end if;
  v_entry := private.post_entry(v_org, v_l.account_id, v_l.amount_cents, p_nature, 'bank_line', v_l.id, 1::smallint,
    gen_random_uuid(), coalesce(nullif(trim(p_description), ''), v_l.description), p_category_id, null,
    v_l.posted_on::timestamp at time zone (select timezone from public.organizations where id = v_org) + interval '12 hours');
  update public.bank_statement_lines set status = 'created', matched_entry_id = v_entry,
    resolved_by = private.uid(), resolved_at = now() where id = p_line_id;
  return v_entry;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.receivables enable row level security;
alter table public.bank_statement_imports enable row level security;
alter table public.bank_statement_lines enable row level security;
revoke all on public.receivables, public.bank_statement_imports, public.bank_statement_lines from anon, authenticated;
grant select on public.receivables, public.bank_statement_imports, public.bank_statement_lines to authenticated;

create policy receivables_read on public.receivables for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy statement_imports_read on public.bank_statement_imports for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy statement_lines_read on public.bank_statement_lines for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
