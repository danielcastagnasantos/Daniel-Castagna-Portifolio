-- =====================================================================
-- 0001_core — organizações, perfis, convites, auditoria e helpers de acesso
-- =====================================================================
-- Convenções do projeto:
--   * Todo valor monetário é INTEIRO EM CENTAVOS (bigint). Nunca numeric/float.
--   * O navegador NÃO escreve nas tabelas: toda escrita passa por funções
--     (RPC) transacionais que validam permissão, empresa e dados.
--   * Registros financeiros nunca são apagados: são cancelados/estornados
--     por lançamentos rastreáveis.
-- Funções internas ficam no schema `private` (não exposto pela API).

create schema if not exists private;

-- ---------------------------------------------------------------------
-- Organização
-- ---------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  timezone text not null default 'America/Sao_Paulo',
  -- Fechamento cego: o operador não vê o valor esperado antes de contar.
  blind_close boolean not null default false,
  -- Movimentações de operador a partir deste valor exigem conferência.
  review_threshold_cents bigint not null default 20000 check (review_threshold_cents >= 0),
  -- Diferença de caixa (em módulo) acima deste valor gera alerta.
  diff_alert_cents bigint not null default 0 check (diff_alert_cents >= 0),
  -- Turno aberto por mais horas que isto gera alerta.
  shift_max_hours integer not null default 12 check (shift_max_hours between 1 and 72),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  organization_id uuid not null references public.organizations (id),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text not null,
  role text not null check (role in ('owner', 'manager', 'cashier')),
  active boolean not null default true,
  must_change_password boolean not null default false,
  email_notifications boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_org_idx on public.profiles (organization_id);
create unique index profiles_email_uidx on public.profiles (lower(email));

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  role text not null check (role in ('owner', 'manager', 'cashier')),
  must_change_password boolean not null default true,
  invited_by uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index invitations_pending_uidx on public.invitations (lower(email)) where accepted_at is null;

-- ---------------------------------------------------------------------
-- Auditoria (append-only)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (organization_id, created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

-- Bloqueia alteração/remoção de tabelas imutáveis (vale também para o dono
-- da tabela; só é possível contornar desabilitando o trigger explicitamente).
create function private.immutable_violation() returns void
language plpgsql set search_path = '' as $$
begin
  raise exception 'Registro imutável: não pode ser alterado ou removido (use estorno/cancelamento)'
    using errcode = 'P0001', hint = 'IMMUTABLE';
end $$;

create function private.deny_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform private.immutable_violation();
  return null;
end $$;

create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function private.deny_mutation();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.deny_mutation();

-- ---------------------------------------------------------------------
-- Helpers de acesso (security definer evita recursão de RLS)
-- ---------------------------------------------------------------------
create function private.uid() returns uuid
language sql stable set search_path = '' as $$ select (select auth.uid()) $$;

create function private.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.organization_id from public.profiles p
  where p.id = (select auth.uid()) and p.active limit 1
$$;

create function private.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.active limit 1
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role in ('owner', 'manager') from public.profiles p
    where p.id = (select auth.uid()) and p.active limit 1), false)
$$;

create function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role = 'owner' from public.profiles p
    where p.id = (select auth.uid()) and p.active limit 1), false)
$$;

-- Garante usuário ativo e devolve a empresa; erro padronizado caso contrário.
create function private.require_org() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.current_org_id();
  if v_org is null then
    raise exception 'Usuário sem acesso ativo' using errcode = 'P0001', hint = 'NO_ACCESS';
  end if;
  return v_org;
end $$;

create function private.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_org();
  if not private.is_admin() then
    raise exception 'Apenas proprietário ou gerente pode executar esta ação' using errcode = 'P0001', hint = 'FORBIDDEN';
  end if;
  return v_org;
end $$;

create function private.require_owner() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_org();
  if not private.is_owner() then
    raise exception 'Apenas o proprietário pode executar esta ação' using errcode = 'P0001', hint = 'FORBIDDEN';
  end if;
  return v_org;
end $$;

create function private.fail(p_message text, p_hint text default null) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception '%', p_message using errcode = 'P0001', hint = p_hint;
end $$;

-- Data local da empresa (fuso configurável; padrão America/Sao_Paulo).
create function private.local_date(p_org uuid, p_ts timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select (p_ts at time zone coalesce((select o.timezone from public.organizations o where o.id = p_org), 'America/Sao_Paulo'))::date
$$;

-- ---------------------------------------------------------------------
-- Trigger genérico de auditoria (guarda só os campos que mudaram)
-- ---------------------------------------------------------------------
create function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_before jsonb;
  v_after jsonb;
  v_old jsonb;
  v_new jsonb;
  v_id text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new) - 'updated_at';
    v_after := v_new;
    v_before := null;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old) - 'updated_at';
    v_new := to_jsonb(new) - 'updated_at';
    select jsonb_object_agg(n.key, n.value), jsonb_object_agg(n.key, v_old -> n.key)
      into v_after, v_before
    from jsonb_each(v_new) n
    where v_old -> n.key is distinct from n.value;
    if v_after is null then return new; end if;
  else
    v_before := to_jsonb(old);
    v_after := null;
    v_new := v_before;
  end if;
  v_org := case when tg_table_name = 'organizations' then (v_new ->> 'id')::uuid
                else (v_new ->> 'organization_id')::uuid end;
  v_id := v_new ->> 'id';
  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, before, after)
  values (v_org, (select auth.uid()), lower(tg_op), tg_argv[0], v_id, v_before, v_after);
  return coalesce(new, old);
end $$;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create function private.audit_event(
  p_org uuid, p_action text, p_entity_type text, p_entity_id text,
  p_before jsonb default null, p_after jsonb default null, p_reason text default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, before, after, reason)
  values (p_org, (select auth.uid()), p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason)
$$;

create trigger organizations_touch before update on public.organizations
  for each row execute function private.touch_updated_at();
create trigger organizations_audit after insert or update on public.organizations
  for each row execute function private.audit_row('organization');
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger profiles_audit after insert or update on public.profiles
  for each row execute function private.audit_row('profile');
create trigger invitations_audit after insert or update on public.invitations
  for each row execute function private.audit_row('invitation');

-- ---------------------------------------------------------------------
-- Criação do perfil quando o usuário de autenticação nasce
-- Sem convite pendente NÃO existe perfil => nenhum acesso (mesmo que alguém
-- consiga criar conta no Auth, não enxerga nem escreve nada).
-- ---------------------------------------------------------------------
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invitations%rowtype;
begin
  select * into v_inv from public.invitations
  where lower(email) = lower(new.email) and accepted_at is null
  order by created_at desc limit 1 for update;
  if found then
    insert into public.profiles (id, organization_id, full_name, email, role, must_change_password, created_by)
    values (new.id, v_inv.organization_id, v_inv.full_name, lower(new.email), v_inv.role, v_inv.must_change_password, v_inv.invited_by);
    update public.invitations set accepted_at = now() where id = v_inv.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Gestão de equipe (RPC)
-- ---------------------------------------------------------------------
-- Regras: proprietário gerencia qualquer perfil; gerente gerencia apenas
-- operadores de caixa; ninguém altera o próprio perfil de acesso; nunca
-- deixa a empresa sem proprietário ativo.
create function private.can_manage_role(p_actor_role text, p_target_role text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_actor_role
    when 'owner' then true
    when 'manager' then p_target_role = 'cashier'
    else false end
$$;

create function public.invite_user(p_email text, p_full_name text, p_role text, p_must_change boolean default true)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid; v_email text := lower(trim(p_email));
begin
  v_org := private.require_admin();
  if p_role not in ('owner', 'manager', 'cashier') then
    perform private.fail('Perfil inválido', 'INVALID'); end if;
  if not private.can_manage_role(private.my_role(), p_role) then
    perform private.fail('Seu perfil não pode criar usuários com este nível de acesso', 'FORBIDDEN'); end if;
  if exists (select 1 from public.profiles where lower(email) = v_email) then
    perform private.fail('Já existe um usuário com este e-mail', 'DUPLICATE'); end if;
  -- Convite anterior não aceito é substituído (ex.: criação do login falhou).
  delete from public.invitations where lower(email) = v_email and accepted_at is null and organization_id = v_org;
  insert into public.invitations (organization_id, email, full_name, role, must_change_password, invited_by)
  values (v_org, v_email, trim(p_full_name), p_role, p_must_change, private.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.cancel_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_admin();
  delete from public.invitations
  where id = p_invitation_id and organization_id = v_org and accepted_at is null;
end $$;

create function public.set_user_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_target public.profiles%rowtype;
begin
  v_org := private.require_owner();  -- somente o proprietário altera níveis de acesso
  if p_role not in ('owner', 'manager', 'cashier') then
    perform private.fail('Perfil inválido', 'INVALID'); end if;
  if p_user_id = private.uid() then
    perform private.fail('Você não pode alterar o seu próprio nível de acesso', 'FORBIDDEN'); end if;
  select * into v_target from public.profiles where id = p_user_id and organization_id = v_org for update;
  if not found then perform private.fail('Usuário não encontrado', 'NOT_FOUND'); end if;
  if v_target.role = p_role then return; end if;
  if v_target.role = 'owner' and v_target.active and
     (select count(*) from public.profiles where organization_id = v_org and role = 'owner' and active) <= 1 then
    perform private.fail('A empresa precisa de ao menos um proprietário ativo', 'LAST_OWNER'); end if;
  update public.profiles set role = p_role where id = p_user_id;
end $$;

create function public.set_user_active(p_user_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_target public.profiles%rowtype;
begin
  v_org := private.require_admin();
  if p_user_id = private.uid() then
    perform private.fail('Você não pode desativar o próprio acesso', 'FORBIDDEN'); end if;
  select * into v_target from public.profiles where id = p_user_id and organization_id = v_org for update;
  if not found then perform private.fail('Usuário não encontrado', 'NOT_FOUND'); end if;
  if not private.can_manage_role(private.my_role(), v_target.role) then
    perform private.fail('Seu perfil não pode alterar este usuário', 'FORBIDDEN'); end if;
  if not p_active and v_target.role = 'owner' and
     (select count(*) from public.profiles where organization_id = v_org and role = 'owner' and active) <= 1 then
    perform private.fail('A empresa precisa de ao menos um proprietário ativo', 'LAST_OWNER'); end if;
  if not p_active and exists (select 1 from public.cash_shifts s where s.employee_id = p_user_id and s.status = 'open') then
    perform private.fail('Este usuário tem um turno de caixa aberto. Feche o turno antes de desativar', 'SHIFT_OPEN'); end if;
  update public.profiles set active = p_active where id = p_user_id;
end $$;

-- Usada pelo servidor ANTES de operações com a service role (trocar senha, bloquear login):
-- a decisão de permissão é sempre do banco, nunca do código que tem a chave privilegiada.
create function public.assert_can_manage_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_role text;
begin
  v_org := private.require_admin();
  if p_user_id = private.uid() then
    perform private.fail('Esta ação não vale para o seu próprio usuário', 'FORBIDDEN'); end if;
  select role into v_role from public.profiles where id = p_user_id and organization_id = v_org;
  if v_role is null then perform private.fail('Usuário não encontrado', 'NOT_FOUND'); end if;
  if not private.can_manage_role(private.my_role(), v_role) then
    perform private.fail('Seu perfil não pode alterar este usuário', 'FORBIDDEN'); end if;
end $$;

create function public.update_user_name(p_user_id uuid, p_full_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_target public.profiles%rowtype;
begin
  v_org := private.require_admin();
  select * into v_target from public.profiles where id = p_user_id and organization_id = v_org for update;
  if not found then perform private.fail('Usuário não encontrado', 'NOT_FOUND'); end if;
  if p_user_id <> private.uid() and not private.can_manage_role(private.my_role(), v_target.role) then
    perform private.fail('Seu perfil não pode alterar este usuário', 'FORBIDDEN'); end if;
  if length(trim(p_full_name)) < 2 then perform private.fail('Nome inválido', 'INVALID'); end if;
  update public.profiles set full_name = trim(p_full_name) where id = p_user_id;
end $$;

-- O próprio usuário limpa a exigência de trocar senha após defini-la.
create function public.clear_must_change_password() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_org();
  update public.profiles set must_change_password = false where id = private.uid();
end $$;

-- Marcação feita pelo servidor (service role) ao gerar senha provisória.
create function public.set_email_notifications(p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_org();
  update public.profiles set email_notifications = p_enabled where id = private.uid();
end $$;

create function public.update_org_settings(
  p_name text, p_blind_close boolean, p_review_threshold_cents bigint,
  p_diff_alert_cents bigint, p_shift_max_hours integer
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_admin();
  if length(trim(p_name)) < 2 then perform private.fail('Nome da empresa inválido', 'INVALID'); end if;
  if p_review_threshold_cents < 0 or p_diff_alert_cents < 0 or p_shift_max_hours not between 1 and 72 then
    perform private.fail('Valores de configuração inválidos', 'INVALID'); end if;
  update public.organizations set name = trim(p_name), blind_close = p_blind_close,
    review_threshold_cents = p_review_threshold_cents, diff_alert_cents = p_diff_alert_cents,
    shift_max_hours = p_shift_max_hours
  where id = v_org;
end $$;

-- ---------------------------------------------------------------------
-- RLS + privilégios do núcleo
-- ---------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.organizations, public.profiles, public.invitations, public.audit_log from anon, authenticated;
grant select on public.organizations, public.profiles, public.invitations, public.audit_log to authenticated;

create policy org_read on public.organizations for select to authenticated
  using (id = (select private.current_org_id()));
-- Operador enxerga só o próprio perfil; administradores veem a equipe.
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid())
         or (organization_id = (select private.current_org_id()) and (select private.is_admin())));
create policy invitations_read on public.invitations for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy audit_read on public.audit_log for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));

revoke all on schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.uid(), private.current_org_id(), private.my_role(),
  private.is_admin(), private.is_owner() to authenticated;
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
-- =====================================================================
-- 0003_cash_shifts — gaveta, turnos, movimentações, fechamento e conferência
-- =====================================================================
-- Dinheiro físico esperado = abertura + entradas em DINHEIRO − saídas em
-- DINHEIRO (Pix/cartão/transferência nunca entram na conta da gaveta).
-- Toda operação é transacional, com trava de linha e chave de idempotência.

create table public.registers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (length(trim(name)) between 2 and 80),
  account_id uuid not null unique references public.accounts (id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index registers_org_name_uidx on public.registers (organization_id, lower(name));
create trigger registers_audit after insert or update on public.registers
  for each row execute function private.audit_row('register');

create table public.cash_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  register_id uuid not null references public.registers (id),
  employee_id uuid not null references public.profiles (id),
  opened_at timestamptz not null default now(),
  opening_cents bigint not null check (opening_cents >= 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  -- passagem de turno
  handoff_expected_cents bigint,
  handoff_difference_cents bigint,
  handoff_note text check (length(handoff_note) <= 500),
  -- fechamento
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  counted_cents bigint check (counted_cents >= 0),
  expected_cents bigint,
  difference_cents bigint,
  close_justification text check (length(close_justification) <= 500),
  blind boolean not null default false,
  -- conferência do gerente
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'flagged')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text check (length(review_note) <= 500),
  open_request_id uuid not null,
  close_request_id uuid,
  created_at timestamptz not null default now(),
  constraint shift_close_consistency check (
    (status = 'open' and closed_at is null and counted_cents is null and expected_cents is null and difference_cents is null)
    or (status = 'closed' and closed_at is not null and counted_cents is not null
        and expected_cents is not null and difference_cents is not null and closed_by is not null)
  )
);
-- Uma única gaveta aberta por vez e um único turno aberto por funcionário.
create unique index one_open_shift_per_register on public.cash_shifts (register_id) where status = 'open';
create unique index one_open_shift_per_employee on public.cash_shifts (employee_id) where status = 'open';
create unique index shifts_open_request_uidx on public.cash_shifts (organization_id, open_request_id);
create index shifts_org_idx on public.cash_shifts (organization_id, opened_at desc);
create index shifts_employee_idx on public.cash_shifts (employee_id, opened_at desc);

-- Turno fechado é congelado: só a conferência (review_*) pode mudar depois.
create function private.guard_shift_update() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_review text[] := array['review_status', 'reviewed_by', 'reviewed_at', 'review_note'];
  v_close text[] := array['status', 'closed_at', 'closed_by', 'counted_cents', 'expected_cents',
    'difference_cents', 'close_justification', 'blind', 'close_request_id'];
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  k text;
begin
  if tg_op = 'DELETE' then perform private.immutable_violation(); end if;
  for k in select jsonb_object_keys(v_new) loop
    if v_old -> k is distinct from v_new -> k then
      if old.status = 'closed' then
        if not (k = any (v_review)) then perform private.immutable_violation(); end if;
      else
        if not (k = any (v_close) or k = any (v_review)) then perform private.immutable_violation(); end if;
      end if;
    end if;
  end loop;
  return new;
end $$;
create trigger shifts_guard before update or delete on public.cash_shifts
  for each row execute function private.guard_shift_update();
create trigger shifts_audit after insert or update on public.cash_shifts
  for each row execute function private.audit_row('cash_shift');

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  shift_id uuid not null references public.cash_shifts (id),
  kind text not null check (kind in ('sale', 'other_in', 'supply', 'refund', 'expense', 'withdrawal', 'bill_payment')),
  direction text not null check (direction in ('in', 'out')),
  payment_method text not null check (payment_method in ('dinheiro', 'pix', 'debito', 'credito', 'transferencia')),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  description text check (length(description) <= 250),
  category_id uuid references public.expense_categories (id),
  counter_account_id uuid references public.accounts (id),
  bill_payment_id uuid,
  corrects_shift_id uuid references public.cash_shifts (id),
  status text not null default 'posted' check (status in ('posted', 'cancelled')),
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancel_reason text,
  review_status text not null default 'not_required' check (review_status in ('not_required', 'pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  client_request_id uuid not null,
  constraint movement_direction_matches_kind check (
    (direction = 'in' and kind in ('sale', 'other_in', 'supply'))
    or (direction = 'out' and kind in ('refund', 'expense', 'withdrawal', 'bill_payment'))),
  constraint movement_cash_only_kinds check (
    kind not in ('supply', 'withdrawal', 'expense', 'bill_payment') or payment_method = 'dinheiro')
);
create unique index movements_request_uidx on public.cash_movements (organization_id, client_request_id);
create index movements_shift_idx on public.cash_movements (shift_id, created_at);
create index movements_org_day_idx on public.cash_movements (organization_id, created_at desc);
create index movements_review_idx on public.cash_movements (organization_id) where review_status = 'pending';

-- Movimentação é imutável, salvo cancelamento e conferência.
create function private.guard_movement_update() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_allowed text[] := array['status', 'cancelled_by', 'cancelled_at', 'cancel_reason',
    'review_status', 'reviewed_by', 'reviewed_at', 'review_note'];
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  k text;
begin
  if tg_op = 'DELETE' then perform private.immutable_violation(); end if;
  if old.status = 'cancelled' then perform private.immutable_violation(); end if;
  for k in select jsonb_object_keys(v_new) loop
    if v_old -> k is distinct from v_new -> k and not (k = any (v_allowed)) then
      perform private.immutable_violation();
    end if;
  end loop;
  return new;
end $$;
create trigger movements_guard before update or delete on public.cash_movements
  for each row execute function private.guard_movement_update();
create trigger movements_audit after insert or update on public.cash_movements
  for each row execute function private.audit_row('cash_movement');

-- ---------------------------------------------------------------------
-- Cálculos
-- ---------------------------------------------------------------------
create function private.shift_expected_cents(p_shift_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select s.opening_cents + coalesce((
    select sum(case when m.direction = 'in' then m.amount_cents else -m.amount_cents end)
    from public.cash_movements m
    where m.shift_id = s.id and m.payment_method = 'dinheiro' and m.status = 'posted'), 0)
  from public.cash_shifts s where s.id = p_shift_id
$$;

create function private.account_balance_cents(p_account uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_cents), 0)::bigint from public.ledger_entries where account_id = p_account
$$;

-- ---------------------------------------------------------------------
-- Caixas (gaveta)
-- ---------------------------------------------------------------------
create function public.create_register(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_acc uuid := gen_random_uuid(); v_id uuid := gen_random_uuid();
begin
  v_org := private.require_admin();
  begin
    insert into public.accounts (id, organization_id, name, type) values (v_acc, v_org, 'Gaveta - ' || trim(p_name), 'cash_drawer');
    insert into public.registers (id, organization_id, name, account_id) values (v_id, v_org, trim(p_name), v_acc);
  exception when unique_violation then
    perform private.fail('Já existe um caixa com este nome', 'DUPLICATE');
  end;
  return v_id;
end $$;

create function public.set_register_active(p_register_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_admin();
  if not p_active and exists (select 1 from public.cash_shifts where register_id = p_register_id and status = 'open') then
    perform private.fail('Há um turno aberto neste caixa', 'SHIFT_OPEN'); end if;
  update public.registers set active = p_active where id = p_register_id and organization_id = v_org;
  update public.accounts set active = p_active
  where id = (select account_id from public.registers where id = p_register_id) and organization_id = v_org;
end $$;

-- Situação das gavetas visível a qualquer usuário ativo (sem valores).
create function public.register_status()
returns table (register_id uuid, register_name text, shift_id uuid, employee_id uuid,
               employee_name text, opened_at timestamptz, is_mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_org();
  return query
    select r.id, r.name, s.id, s.employee_id, p.full_name, s.opened_at, (s.employee_id = private.uid())
    from public.registers r
    left join public.cash_shifts s on s.register_id = r.id and s.status = 'open'
    left join public.profiles p on p.id = s.employee_id
    where r.organization_id = v_org and r.active
    order by r.name;
end $$;

-- Contas que podem receber sangria/suprimento (só nomes: sem saldos).
create function public.cash_counter_accounts() returns table (id uuid, name text, type text)
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_org();
  return query select a.id, a.name, a.type from public.accounts a
    where a.organization_id = v_org and a.active and a.type in ('safe', 'bank', 'pix') order by a.type desc, a.name;
end $$;

-- ---------------------------------------------------------------------
-- Abertura de turno (passagem com conferência obrigatória)
-- ---------------------------------------------------------------------
create function public.open_cash_shift(
  p_register_id uuid, p_opening_cents bigint, p_note text, p_request_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_reg public.registers%rowtype; v_existing uuid; v_id uuid := gen_random_uuid();
  v_open record; v_ledger bigint; v_has_prev boolean; v_diff bigint; v_note text;
begin
  v_org := private.require_org();
  select id into v_existing from public.cash_shifts where organization_id = v_org and open_request_id = p_request_id;
  if found then return v_existing; end if;

  if p_opening_cents is null or p_opening_cents < 0 or p_opening_cents > 100000000000 then
    perform private.fail('Saldo inicial inválido', 'INVALID'); end if;

  -- A trava da gaveta serializa aberturas simultâneas.
  select * into v_reg from public.registers where id = p_register_id and organization_id = v_org and active for update;
  if not found then perform private.fail('Caixa não encontrado para sua empresa', 'NOT_FOUND'); end if;

  -- Repetição concorrente: quem esperou a trava devolve o turno já criado pela mesma requisição.
  select id into v_existing from public.cash_shifts where organization_id = v_org and open_request_id = p_request_id;
  if found then return v_existing; end if;

  select s.id, p.full_name into v_open from public.cash_shifts s
    join public.profiles p on p.id = s.employee_id
    where s.register_id = p_register_id and s.status = 'open';
  if found then
    perform private.fail('Há um turno aberto nesta gaveta (' || v_open.full_name || '). Feche-o antes de iniciar o próximo', 'SHIFT_ALREADY_OPEN');
  end if;
  if exists (select 1 from public.cash_shifts where employee_id = private.uid() and status = 'open') then
    perform private.fail('Você já tem um turno aberto', 'SHIFT_ALREADY_OPEN'); end if;

  v_ledger := private.account_balance_cents(v_reg.account_id);
  v_has_prev := exists (select 1 from public.cash_shifts where register_id = p_register_id and status = 'closed');
  v_diff := p_opening_cents - v_ledger;
  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_has_prev and v_diff <> 0 and coalesce(length(v_note), 0) < 4 then
    perform private.fail('A contagem difere do que foi deixado pelo turno anterior. Conte novamente e, se confirmar, informe o motivo', 'HANDOFF_NOTE_REQUIRED');
  end if;

  begin
    insert into public.cash_shifts (id, organization_id, register_id, employee_id, opening_cents,
      handoff_expected_cents, handoff_difference_cents, handoff_note, open_request_id)
    values (v_id, v_org, p_register_id, private.uid(), p_opening_cents,
      case when v_has_prev then v_ledger end, case when v_has_prev then v_diff end, v_note, p_request_id);
  exception
    when unique_violation then
      select id into v_existing from public.cash_shifts where organization_id = v_org and open_request_id = p_request_id;
      if v_existing is not null then return v_existing; end if;
      perform private.fail('Já existe um turno aberto nesta gaveta ou para você', 'SHIFT_ALREADY_OPEN');
  end;

  -- Alinha o razão da gaveta com a contagem física informada.
  if v_diff <> 0 then
    perform private.post_entry(v_org, v_reg.account_id, v_diff,
      case when v_has_prev then 'cash_difference' else 'opening_balance' end,
      'shift_open', v_id, 1::smallint, gen_random_uuid(),
      case when v_has_prev then 'Diferença na passagem de turno' else 'Saldo inicial da gaveta' end,
      null, v_id);
  end if;
  if v_has_prev and v_diff <> 0 then
    perform private.notify(v_org, 'handoff_mismatch', 'warning',
      'Diferença na passagem de turno',
      'O saldo informado na abertura diferiu do deixado pelo turno anterior em ' || private.fmt_brl(v_diff) || '.',
      '/caixa/turnos/' || v_id, 'handoff:' || v_id, 'cash_shift', v_id);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Movimentações
-- ---------------------------------------------------------------------
create function private.insert_movement(
  p_org uuid, p_shift public.cash_shifts, p_kind text, p_method text, p_amount bigint,
  p_description text, p_category uuid, p_counter uuid, p_corrects uuid,
  p_request uuid, p_needs_review boolean, p_bill_payment uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid(); v_group uuid := gen_random_uuid();
  v_dir text; v_cash_acc uuid; v_acc uuid; v_counter_type text; v_desc text := nullif(trim(coalesce(p_description, '')), '');
begin
  v_dir := case when p_kind in ('sale', 'other_in', 'supply') then 'in' else 'out' end;
  select account_id into v_cash_acc from public.registers where id = p_shift.register_id;

  insert into public.cash_movements (
    id, organization_id, shift_id, kind, direction, payment_method, amount_cents, description,
    category_id, counter_account_id, corrects_shift_id, review_status, created_by, client_request_id, bill_payment_id)
  values (
    v_id, p_org, p_shift.id, p_kind, v_dir, p_method, p_amount, v_desc,
    p_category, p_counter, p_corrects, case when p_needs_review then 'pending' else 'not_required' end,
    private.uid(), p_request, p_bill_payment);

  if p_kind in ('sale', 'other_in', 'refund') then
    v_acc := private.account_for_method(p_org, p_method, v_cash_acc);
    perform private.post_entry(p_org, v_acc,
      case when v_dir = 'in' then p_amount else -p_amount end,
      case p_kind when 'sale' then 'revenue' when 'other_in' then 'other_income' else 'refund' end,
      'cash_movement', v_id, 1::smallint, v_group, v_desc, p_category, p_shift.id);
  elsif p_kind in ('expense', 'bill_payment') then
    perform private.post_entry(p_org, v_cash_acc, -p_amount, 'expense',
      'cash_movement', v_id, 1::smallint, v_group, v_desc, p_category, p_shift.id);
  elsif p_kind = 'withdrawal' then
    -- Sangria para outra conta é transferência; sem destino é retirada do proprietário.
    perform private.post_entry(p_org, v_cash_acc, -p_amount, case when p_counter is null then 'withdrawal' else 'transfer' end,
      'cash_movement', v_id, 1::smallint, v_group, coalesce(v_desc, 'Sangria'), null, p_shift.id);
    if p_counter is not null then
      perform private.post_entry(p_org, p_counter, p_amount, 'transfer',
        'cash_movement', v_id, 2::smallint, v_group, coalesce(v_desc, 'Sangria'), null, p_shift.id);
    end if;
  elsif p_kind = 'supply' then
    perform private.post_entry(p_org, v_cash_acc, p_amount, case when p_counter is null then 'contribution' else 'transfer' end,
      'cash_movement', v_id, 1::smallint, v_group, coalesce(v_desc, 'Suprimento'), null, p_shift.id);
    if p_counter is not null then
      perform private.post_entry(p_org, p_counter, -p_amount, 'transfer',
        'cash_movement', v_id, 2::smallint, v_group, coalesce(v_desc, 'Suprimento'), null, p_shift.id);
    end if;
  end if;
  return v_id;
end $$;

create function public.create_cash_movement(
  p_shift_id uuid, p_kind text, p_method text, p_amount_cents bigint, p_description text,
  p_category_id uuid, p_counter_account_id uuid, p_request_id uuid, p_corrects_shift_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_shift public.cash_shifts%rowtype; v_admin boolean; v_existing public.cash_movements%rowtype;
  v_threshold bigint; v_review boolean := false; v_id uuid; v_ctype text; v_desc text := trim(coalesce(p_description, ''));
begin
  v_org := private.require_org();
  v_admin := private.is_admin();

  select * into v_existing from public.cash_movements where organization_id = v_org and client_request_id = p_request_id;
  if found then
    if v_existing.shift_id <> p_shift_id or v_existing.created_by <> private.uid() then
      perform private.fail('Chave de requisição já utilizada', 'DUPLICATE'); end if;
    return v_existing.id;
  end if;

  if p_kind not in ('sale', 'other_in', 'supply', 'refund', 'expense', 'withdrawal') then
    perform private.fail('Tipo de movimentação inválido', 'INVALID'); end if;
  if p_method not in ('dinheiro', 'pix', 'debito', 'credito', 'transferencia') then
    perform private.fail('Forma de pagamento inválida', 'INVALID'); end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000000 then
    perform private.fail('Informe um valor maior que zero', 'INVALID'); end if;
  if p_kind in ('supply', 'withdrawal', 'expense') and p_method <> 'dinheiro' then
    perform private.fail('Sangria, suprimento e despesa do caixa são sempre em dinheiro', 'INVALID'); end if;
  if p_kind in ('other_in', 'refund', 'expense', 'withdrawal', 'supply') and length(v_desc) < 3 then
    perform private.fail('Descreva a movimentação (mínimo 3 caracteres)', 'DESCRIPTION_REQUIRED'); end if;
  if p_kind = 'expense' then
    if not exists (select 1 from public.expense_categories where id = p_category_id and organization_id = v_org and active and kind = 'expense') then
      perform private.fail('Escolha a categoria da despesa', 'CATEGORY_REQUIRED'); end if;
  end if;
  if p_counter_account_id is not null then
    if p_kind not in ('supply', 'withdrawal') then perform private.fail('Conta de contrapartida só vale para sangria/suprimento', 'INVALID'); end if;
    select type into v_ctype from public.accounts where id = p_counter_account_id and organization_id = v_org and active;
    if v_ctype is null or v_ctype = 'cash_drawer' then perform private.fail('Conta de contrapartida inválida', 'INVALID'); end if;
  end if;

  -- A trava do turno serializa lançamentos e fechamento do mesmo turno.
  select * into v_shift from public.cash_shifts where id = p_shift_id and organization_id = v_org for update;
  if not found then perform private.fail('Turno não encontrado', 'NOT_FOUND'); end if;
  if v_shift.status <> 'open' then
    perform private.fail('Este turno já foi fechado. Registre a correção no turno atual', 'SHIFT_CLOSED'); end if;

  if not v_admin then
    if v_shift.employee_id <> private.uid() then
      perform private.fail('Este turno pertence a outro funcionário', 'FORBIDDEN'); end if;
    if p_kind in ('other_in', 'refund') then
      perform private.fail('Este lançamento deve ser feito pela gerência', 'FORBIDDEN'); end if;
    if p_corrects_shift_id is not null then perform private.fail('Sem permissão', 'FORBIDDEN'); end if;
    select review_threshold_cents into v_threshold from public.organizations where id = v_org;
    v_review := p_kind in ('expense', 'withdrawal', 'supply') and p_amount_cents >= v_threshold;
  end if;
  if p_corrects_shift_id is not null and not exists (
      select 1 from public.cash_shifts where id = p_corrects_shift_id and organization_id = v_org and status = 'closed') then
    perform private.fail('Turno de referência inválido', 'INVALID'); end if;

  begin
    v_id := private.insert_movement(v_org, v_shift, p_kind, p_method, p_amount_cents, v_desc,
      p_category_id, p_counter_account_id, p_corrects_shift_id, p_request_id, v_review);
  exception when unique_violation then
    select id into v_id from public.cash_movements where organization_id = v_org and client_request_id = p_request_id;
    if v_id is null then raise; end if;
    return v_id;
  end;

  if v_review then
    perform private.notify(v_org, 'movement_review', 'warning', 'Movimentação aguardando conferência',
      private.kind_label(p_kind) || ' de ' || private.fmt_brl(p_amount_cents) || ' lançada por operador.',
      '/caixa/turnos/' || p_shift_id, 'review:' || v_id, 'cash_movement', v_id);
  end if;
  return v_id;
end $$;

create function public.cancel_cash_movement(p_movement_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_m public.cash_movements%rowtype; v_shift public.cash_shifts%rowtype;
begin
  v_org := private.require_admin();
  if length(trim(coalesce(p_reason, ''))) < 5 then perform private.fail('Informe o motivo do cancelamento', 'REASON_REQUIRED'); end if;
  select * into v_m from public.cash_movements where id = p_movement_id and organization_id = v_org;
  if not found then perform private.fail('Movimentação não encontrada', 'NOT_FOUND'); end if;
  select * into v_shift from public.cash_shifts where id = v_m.shift_id for update;
  select * into v_m from public.cash_movements where id = p_movement_id for update;
  if v_m.status = 'cancelled' then return; end if;
  if v_shift.status <> 'open' then
    perform private.fail('Turno já fechado: não é possível cancelar. Lance a correção no turno atual', 'SHIFT_CLOSED'); end if;
  if v_m.kind = 'bill_payment' then
    perform private.fail('Cancele pelo pagamento do boleto', 'USE_BILL'); end if;
  perform private.reverse_source(v_org, 'cash_movement', v_m.id, p_reason);
  update public.cash_movements set status = 'cancelled', cancelled_by = private.uid(), cancelled_at = now(),
    cancel_reason = trim(p_reason), review_status = case when review_status = 'pending' then 'not_required' else review_status end
  where id = v_m.id;
end $$;

create function public.review_cash_movement(p_movement_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_m public.cash_movements%rowtype;
begin
  v_org := private.require_admin();
  select * into v_m from public.cash_movements where id = p_movement_id and organization_id = v_org for update;
  if not found then perform private.fail('Movimentação não encontrada', 'NOT_FOUND'); end if;
  if v_m.review_status <> 'pending' then perform private.fail('Esta movimentação não está aguardando conferência', 'INVALID'); end if;
  if v_m.created_by = private.uid() then perform private.fail('Quem lançou não pode aprovar o próprio lançamento', 'FORBIDDEN'); end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 4 then
    perform private.fail('Informe o motivo da recusa', 'REASON_REQUIRED'); end if;
  update public.cash_movements set review_status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = private.uid(), reviewed_at = now(), review_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_movement_id;
  perform private.resolve_notification(v_org, 'review:' || p_movement_id);
end $$;

-- ---------------------------------------------------------------------
-- Fechamento
-- ---------------------------------------------------------------------
create function public.close_cash_shift(
  p_shift_id uuid, p_counted_cents bigint, p_justification text, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_shift public.cash_shifts%rowtype; v_expected bigint; v_diff bigint; v_acc uuid;
  v_alert bigint; v_blind boolean; v_just text := nullif(trim(coalesce(p_justification, '')), '');
begin
  v_org := private.require_org();
  select * into v_shift from public.cash_shifts where id = p_shift_id and organization_id = v_org for update;
  if not found then perform private.fail('Turno não encontrado', 'NOT_FOUND'); end if;
  if v_shift.status = 'closed' then
    if v_shift.close_request_id = p_request_id then
      return jsonb_build_object('shift_id', v_shift.id, 'expected_cents', v_shift.expected_cents,
        'counted_cents', v_shift.counted_cents, 'difference_cents', v_shift.difference_cents, 'replayed', true);
    end if;
    perform private.fail('Este turno já está fechado', 'SHIFT_CLOSED');
  end if;
  if v_shift.employee_id <> private.uid() and not private.is_admin() then
    perform private.fail('Apenas o responsável ou a gerência pode fechar este turno', 'FORBIDDEN'); end if;
  if p_counted_cents is null or p_counted_cents < 0 or p_counted_cents > 100000000000 then
    perform private.fail('Dinheiro contado inválido', 'INVALID'); end if;

  v_expected := private.shift_expected_cents(v_shift.id);
  v_diff := p_counted_cents - v_expected;
  if v_diff <> 0 and coalesce(length(v_just), 0) < 4 then
    perform private.fail('Há diferença no caixa. Informe a justificativa (mínimo 4 caracteres)', 'JUSTIFICATION_REQUIRED'); end if;

  select blind_close, diff_alert_cents into v_blind, v_alert from public.organizations where id = v_org;
  update public.cash_shifts set status = 'closed', closed_at = now(), closed_by = private.uid(),
    counted_cents = p_counted_cents, expected_cents = v_expected, difference_cents = v_diff,
    close_justification = v_just, blind = v_blind, close_request_id = p_request_id
  where id = v_shift.id;

  select account_id into v_acc from public.registers where id = v_shift.register_id;
  if v_diff <> 0 then
    perform private.post_entry(v_org, v_acc, v_diff, 'cash_difference', 'shift_close', v_shift.id, 1::smallint,
      gen_random_uuid(), 'Diferença de fechamento de caixa', null, v_shift.id);
    if abs(v_diff) > v_alert then
      perform private.notify(v_org, 'cash_difference', case when abs(v_diff) >= 5000 then 'critical' else 'warning' end,
        'Diferença no fechamento do caixa',
        'Diferença de ' || private.fmt_brl(v_diff) || ' no fechamento. Justificativa: ' || v_just,
        '/caixa/turnos/' || v_shift.id, 'diff:' || v_shift.id, 'cash_shift', v_shift.id);
    end if;
  end if;
  perform private.resolve_notification(v_org, 'long:' || v_shift.id);
  return jsonb_build_object('shift_id', v_shift.id, 'expected_cents', v_expected,
    'counted_cents', p_counted_cents, 'difference_cents', v_diff, 'replayed', false);
end $$;

create function public.review_cash_shift(p_shift_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_s public.cash_shifts%rowtype;
begin
  v_org := private.require_admin();
  if p_status not in ('approved', 'flagged') then perform private.fail('Situação inválida', 'INVALID'); end if;
  select * into v_s from public.cash_shifts where id = p_shift_id and organization_id = v_org for update;
  if not found then perform private.fail('Turno não encontrado', 'NOT_FOUND'); end if;
  if v_s.status <> 'closed' then perform private.fail('Só é possível conferir turnos fechados', 'INVALID'); end if;
  if p_status = 'flagged' and length(trim(coalesce(p_note, ''))) < 4 then
    perform private.fail('Descreva o problema encontrado', 'REASON_REQUIRED'); end if;
  update public.cash_shifts set review_status = p_status, reviewed_by = private.uid(), reviewed_at = now(),
    review_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_shift_id;
end $$;

-- ---------------------------------------------------------------------
-- Resumo do turno (respeita fechamento cego)
-- ---------------------------------------------------------------------
create function public.shift_summary(p_shift_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid; v_s public.cash_shifts%rowtype; v_blind boolean; v_mask boolean; v_by_method jsonb; v_totals jsonb;
begin
  v_org := private.require_org();
  select * into v_s from public.cash_shifts where id = p_shift_id and organization_id = v_org;
  if not found or (v_s.employee_id <> private.uid() and not private.is_admin()) then
    perform private.fail('Turno não encontrado', 'NOT_FOUND'); end if;
  select blind_close into v_blind from public.organizations where id = v_org;
  v_mask := v_s.status = 'open' and v_blind and not private.is_admin();

  select coalesce(jsonb_object_agg(payment_method, t), '{}'::jsonb) into v_by_method from (
    select payment_method, sum(amount_cents)::bigint t from public.cash_movements
    where shift_id = p_shift_id and status = 'posted' and kind = 'sale' group by payment_method) x;

  select jsonb_build_object(
    'sales', coalesce(sum(amount_cents) filter (where kind = 'sale'), 0),
    'other_in', coalesce(sum(amount_cents) filter (where kind = 'other_in'), 0),
    'supply', coalesce(sum(amount_cents) filter (where kind = 'supply'), 0),
    'withdrawal', coalesce(sum(amount_cents) filter (where kind = 'withdrawal'), 0),
    'expense', coalesce(sum(amount_cents) filter (where kind in ('expense', 'bill_payment')), 0),
    'refund', coalesce(sum(amount_cents) filter (where kind = 'refund'), 0),
    'cash_in', coalesce(sum(amount_cents) filter (where direction = 'in' and payment_method = 'dinheiro'), 0),
    'cash_out', coalesce(sum(amount_cents) filter (where direction = 'out' and payment_method = 'dinheiro'), 0),
    'count', count(*)) into v_totals
  from public.cash_movements where shift_id = p_shift_id and status = 'posted';

  return jsonb_build_object(
    'shift_id', v_s.id, 'status', v_s.status, 'opening_cents', v_s.opening_cents,
    'blind', v_mask,
    'expected_cents', case when v_mask then null when v_s.status = 'closed' then v_s.expected_cents
                           else private.shift_expected_cents(v_s.id) end,
    'counted_cents', v_s.counted_cents, 'difference_cents', v_s.difference_cents,
    'sales_by_method', v_by_method, 'totals', v_totals);
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.registers enable row level security;
alter table public.cash_shifts enable row level security;
alter table public.cash_movements enable row level security;

revoke all on public.registers, public.cash_shifts, public.cash_movements from anon, authenticated;
grant select on public.registers, public.cash_shifts, public.cash_movements to authenticated;

create policy registers_read on public.registers for select to authenticated
  using (organization_id = (select private.current_org_id()));
-- Operador enxerga apenas os próprios turnos e movimentações.
create policy shifts_read on public.cash_shifts for select to authenticated
  using (organization_id = (select private.current_org_id())
         and ((select private.is_admin()) or employee_id = (select auth.uid())));
create policy movements_read on public.cash_movements for select to authenticated
  using (organization_id = (select private.current_org_id())
         and ((select private.is_admin()) or exists (
              select 1 from public.cash_shifts s where s.id = shift_id and s.employee_id = (select auth.uid()))));
-- =====================================================================
-- 0004_notifications — central de notificações (+ helpers de texto)
-- =====================================================================
-- As notificações são geradas por eventos (fechamento com diferença,
-- movimentação a conferir) e por varredura periódica (vencimentos, turno
-- aberto há muito tempo). `dedupe_key` garante que o mesmo fato notifica
-- uma única vez, mesmo que a varredura rode várias vezes.

create function private.fmt_brl(p_cents bigint) returns text
language sql immutable set search_path = '' as $$
  select case when p_cents < 0 then '-' else '' end || 'R$ ' ||
    regexp_replace((abs(p_cents) / 100)::text, '(\d)(?=(\d{3})+$)', '\1.', 'g') || ',' ||
    lpad((abs(p_cents) % 100)::text, 2, '0')
$$;

create function private.kind_label(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'sale' then 'Venda' when 'other_in' then 'Outra entrada' when 'supply' then 'Suprimento'
    when 'refund' then 'Estorno' when 'expense' then 'Despesa' when 'withdrawal' then 'Sangria'
    when 'bill_payment' then 'Pagamento de boleto' else p_kind end
$$;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  kind text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title text not null,
  body text,
  link text,
  dedupe_key text not null,
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index notifications_dedupe_uidx on public.notifications (organization_id, dedupe_key);
create index notifications_feed_idx on public.notifications (organization_id, created_at desc);

create table public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table public.notification_deliveries (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  channel text not null default 'email',
  status text not null check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create unique index deliveries_once_uidx on public.notification_deliveries (notification_id, user_id, channel)
  where status = 'sent';

create function private.notify(
  p_org uuid, p_kind text, p_severity text, p_title text, p_body text, p_link text,
  p_dedupe text, p_entity_type text default null, p_entity_id uuid default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (organization_id, kind, severity, title, body, link, dedupe_key, entity_type, entity_id)
  values (p_org, p_kind, p_severity, p_title, p_body, p_link, p_dedupe, p_entity_type, p_entity_id)
  on conflict (organization_id, dedupe_key) do nothing
$$;

create function private.resolve_notification(p_org uuid, p_dedupe text) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set resolved_at = now()
  where organization_id = p_org and dedupe_key = p_dedupe and resolved_at is null
$$;

-- Varredura por tempo: vencimentos e turnos abertos por muito tempo.
create function private.generate_notifications(p_org uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_today date := private.local_date(p_org); r record; n integer := 0; v_before integer; v_after integer;
begin
  select count(*) into v_before from public.notifications where organization_id = p_org;

  for r in
    select b.id, b.due_date, b.amount_cents - b.paid_cents as remaining, s.name as supplier
    from public.bills b join public.suppliers s on s.id = b.supplier_id
    where b.organization_id = p_org and b.status in ('open', 'partial') and b.due_date <= v_today + 3
  loop
    if r.due_date < v_today then
      perform private.notify(p_org, 'bill_overdue', 'critical', 'Boleto vencido: ' || r.supplier,
        private.fmt_brl(r.remaining) || ' venceu em ' || to_char(r.due_date, 'DD/MM/YYYY') || '.',
        '/boletos/' || r.id, 'overdue:' || r.id, 'bill', r.id);
    else
      perform private.notify(p_org, 'bill_due_soon', case when r.due_date = v_today then 'critical' else 'warning' end,
        case when r.due_date = v_today then 'Boleto vence hoje: ' || r.supplier
             else 'Boleto vence em ' || (r.due_date - v_today) || ' dia(s): ' || r.supplier end,
        private.fmt_brl(r.remaining) || ' com vencimento em ' || to_char(r.due_date, 'DD/MM/YYYY') || '.',
        '/boletos/' || r.id, 'due:' || r.id || ':' || r.due_date, 'bill', r.id);
    end if;
  end loop;

  for r in
    select s.id, s.opened_at, p.full_name, o.shift_max_hours
    from public.cash_shifts s
    join public.profiles p on p.id = s.employee_id
    join public.organizations o on o.id = s.organization_id
    where s.organization_id = p_org and s.status = 'open'
      and s.opened_at < now() - make_interval(hours => o.shift_max_hours)
  loop
    perform private.notify(p_org, 'shift_open_long', 'warning', 'Caixa aberto há muito tempo',
      'O turno de ' || r.full_name || ' está aberto desde ' ||
        to_char(r.opened_at at time zone (select timezone from public.organizations where id = p_org), 'DD/MM HH24:MI') || '.',
      '/caixa/turnos/' || r.id, 'long:' || r.id, 'cash_shift', r.id);
  end loop;

  -- Encerra avisos de boletos que já foram pagos ou cancelados.
  update public.notifications n set resolved_at = now()
  where n.organization_id = p_org and n.resolved_at is null and n.entity_type = 'bill'
    and exists (select 1 from public.bills b where b.id = n.entity_id and b.status in ('paid', 'cancelled'));

  select count(*) into v_after from public.notifications where organization_id = p_org;
  return v_after - v_before;
end $$;

create function public.refresh_notifications() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_admin();
  return private.generate_notifications(v_org);
end $$;

-- Chamada pelo agendador (service role).
create function public.svc_generate_all_notifications() returns integer
language plpgsql security definer set search_path = '' as $$
declare o record; n integer := 0;
begin
  for o in select id from public.organizations loop
    n := n + private.generate_notifications(o.id);
  end loop;
  return n;
end $$;

create function public.mark_notifications_read(p_ids uuid[] default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_admin();
  insert into public.notification_reads (notification_id, user_id)
  select n.id, private.uid() from public.notifications n
  where n.organization_id = v_org and (p_ids is null or n.id = any (p_ids))
  on conflict do nothing;
end $$;

-- Feed já com "lida?" do usuário atual.
create view public.notification_feed with (security_invoker = true) as
  select n.id, n.organization_id, n.kind, n.severity, n.title, n.body, n.link, n.created_at, n.resolved_at,
         n.entity_type, n.entity_id,
         (r.read_at is not null) as is_read
  from public.notifications n
  left join public.notification_reads r on r.notification_id = n.id and r.user_id = (select auth.uid());

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.notification_deliveries enable row level security;
revoke all on public.notifications, public.notification_reads, public.notification_deliveries,
  public.notification_feed from anon, authenticated;
grant select on public.notifications, public.notification_feed to authenticated;
grant select on public.notification_reads to authenticated;

create policy notifications_read on public.notifications for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy notification_reads_own on public.notification_reads for select to authenticated
  using (user_id = (select auth.uid()));
-- =====================================================================
-- 0005_payables — fornecedores, boletos (únicos, parcelados, recorrentes),
--                 pagamentos (parciais), anexos e histórico
-- =====================================================================
-- O sistema NÃO paga boletos nem se conecta ao banco: ele controla o que
-- deve ser pago e registra o pagamento SOMENTE depois que uma pessoa
-- confirma (p_confirmed) que conferiu no banco.

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (length(trim(name)) between 2 and 140),
  document text check (length(document) <= 24),
  phone text check (length(phone) <= 30),
  email text check (length(email) <= 160),
  notes text check (length(notes) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index suppliers_org_name_uidx on public.suppliers (organization_id, lower(name));
create trigger suppliers_touch before update on public.suppliers
  for each row execute function private.touch_updated_at();
create trigger suppliers_audit after insert or update on public.suppliers
  for each row execute function private.audit_row('supplier');

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  supplier_id uuid not null references public.suppliers (id),
  description text not null check (length(trim(description)) between 2 and 200),
  category_id uuid references public.expense_categories (id),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  paid_cents bigint not null default 0 check (paid_cents >= 0),
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'partial', 'paid', 'cancelled')),
  paid_on date,
  barcode text check (barcode ~ '^[0-9]{44,48}$'),
  notes text check (length(notes) <= 500),
  series_id uuid not null,
  series_kind text not null default 'single' check (series_kind in ('single', 'installments', 'recurring')),
  installment_no integer not null default 1,
  installments_total integer not null default 1,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancel_reason text,
  constraint bill_paid_within_amount check (paid_cents <= amount_cents),
  constraint bill_status_matches_payment check (
    (status = 'open' and paid_cents = 0) or
    (status = 'partial' and paid_cents > 0 and paid_cents < amount_cents) or
    (status = 'paid' and paid_cents = amount_cents and paid_on is not null) or
    (status = 'cancelled' and paid_cents = 0))
);
create unique index bills_series_uidx on public.bills (organization_id, series_id, installment_no);
create index bills_org_due_idx on public.bills (organization_id, due_date) where status in ('open', 'partial');
create index bills_supplier_idx on public.bills (supplier_id);
create trigger bills_touch before update on public.bills
  for each row execute function private.touch_updated_at();
create trigger bills_audit after insert or update on public.bills
  for each row execute function private.audit_row('bill');
create trigger bills_no_delete before delete on public.bills
  for each row execute function private.deny_mutation();

create table public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bill_id uuid not null references public.bills (id),
  amount_cents bigint not null check (amount_cents > 0),
  paid_on date not null,
  account_id uuid not null references public.accounts (id),
  method text not null check (method in ('pix', 'boleto', 'dinheiro', 'transferencia', 'debito_automatico', 'outro')),
  note text check (length(note) <= 250),
  movement_id uuid references public.cash_movements (id),
  status text not null default 'posted' check (status in ('posted', 'cancelled')),
  cancelled_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancel_reason text,
  confirmed_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  client_request_id uuid not null
);
create unique index bill_payments_request_uidx on public.bill_payments (organization_id, client_request_id);
create index bill_payments_bill_idx on public.bill_payments (bill_id);
create index bill_payments_org_day_idx on public.bill_payments (organization_id, paid_on desc);

create function private.guard_payment_update() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_allowed text[] := array['status', 'cancelled_by', 'cancelled_at', 'cancel_reason'];
  v_old jsonb := to_jsonb(old); v_new jsonb := to_jsonb(new); k text;
begin
  if tg_op = 'DELETE' or old.status = 'cancelled' then perform private.immutable_violation(); end if;
  for k in select jsonb_object_keys(v_new) loop
    if v_old -> k is distinct from v_new -> k and not (k = any (v_allowed))
       and not (k = 'movement_id' and old.movement_id is null) then
      perform private.immutable_violation(); end if;
  end loop;
  return new;
end $$;
create trigger bill_payments_guard before update or delete on public.bill_payments
  for each row execute function private.guard_payment_update();
create trigger bill_payments_audit after insert or update on public.bill_payments
  for each row execute function private.audit_row('bill_payment');

alter table public.cash_movements
  add constraint movements_bill_payment_fk foreign key (bill_payment_id) references public.bill_payments (id)
  deferrable initially deferred;

create table public.bill_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  bill_id uuid not null references public.bills (id),
  payment_id uuid references public.bill_payments (id),
  kind text not null check (kind in ('boleto', 'receipt')),
  path text not null unique,
  filename text not null check (length(filename) <= 200),
  mime text not null check (mime in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index bill_files_bill_idx on public.bill_files (bill_id);
create trigger bill_files_immutable before update or delete on public.bill_files
  for each row execute function private.deny_mutation();
create trigger bill_files_audit after insert on public.bill_files
  for each row execute function private.audit_row('bill_file');

-- ---------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------
create function public.upsert_supplier(
  p_id uuid, p_name text, p_document text, p_phone text, p_email text, p_notes text, p_active boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid;
begin
  v_org := private.require_admin();
  begin
    if p_id is null then
      insert into public.suppliers (organization_id, name, document, phone, email, notes, active)
      values (v_org, trim(p_name), nullif(trim(p_document), ''), nullif(trim(p_phone), ''),
        nullif(trim(p_email), ''), nullif(trim(p_notes), ''), coalesce(p_active, true))
      returning id into v_id;
    else
      update public.suppliers set name = trim(p_name), document = nullif(trim(p_document), ''),
        phone = nullif(trim(p_phone), ''), email = nullif(trim(p_email), ''),
        notes = nullif(trim(p_notes), ''), active = coalesce(p_active, true)
      where id = p_id and organization_id = v_org returning id into v_id;
      if v_id is null then perform private.fail('Fornecedor não encontrado', 'NOT_FOUND'); end if;
    end if;
  exception when unique_violation then
    perform private.fail('Já existe um fornecedor com este nome', 'DUPLICATE');
  end;
  return v_id;
end $$;

create function private.clean_barcode(p_barcode text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := regexp_replace(coalesce(p_barcode, ''), '[^0-9]', '', 'g');
begin
  if v = '' then return null; end if;
  if length(v) not in (44, 47, 48) then
    perform private.fail('Linha digitável inválida: informe 47 ou 48 dígitos (ou 44 do código de barras)', 'INVALID');
  end if;
  return v;
end $$;

create function public.create_bills(
  p_supplier_id uuid, p_description text, p_category_id uuid, p_amount_cents bigint,
  p_first_due date, p_mode text, p_count integer, p_interval text,
  p_barcode text, p_notes text, p_request_id uuid
) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_ids uuid[]; v_n integer; v_base bigint; v_rem bigint; v_amt bigint; v_due date; i integer; v_id uuid;
  v_barcode text;
begin
  v_org := private.require_admin();
  select array_agg(id order by installment_no) into v_ids from public.bills
  where organization_id = v_org and series_id = p_request_id;
  if v_ids is not null then return v_ids; end if;

  if p_mode not in ('single', 'installments', 'recurring') then perform private.fail('Modo inválido', 'INVALID'); end if;
  if p_interval not in ('month', 'week') then perform private.fail('Periodicidade inválida', 'INVALID'); end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000000 then
    perform private.fail('Informe um valor maior que zero', 'INVALID'); end if;
  v_n := case when p_mode = 'single' then 1 else coalesce(p_count, 0) end;
  if v_n < 1 or v_n > 60 or (p_mode <> 'single' and v_n < 2) then
    perform private.fail('Quantidade de parcelas/ocorrências deve ficar entre 2 e 60', 'INVALID'); end if;
  if p_mode = 'installments' and p_amount_cents < v_n then
    perform private.fail('Valor total menor que o número de parcelas', 'INVALID'); end if;
  if p_first_due is null or p_first_due < date '2000-01-01' or p_first_due > date '2100-01-01' then
    perform private.fail('Data de vencimento inválida', 'INVALID'); end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and organization_id = v_org and active) then
    perform private.fail('Fornecedor inválido ou inativo', 'INVALID'); end if;
  if p_category_id is not null and not exists (
      select 1 from public.expense_categories where id = p_category_id and organization_id = v_org and kind = 'expense') then
    perform private.fail('Categoria inválida', 'INVALID'); end if;
  v_barcode := private.clean_barcode(p_barcode);
  if v_barcode is not null and p_mode <> 'single' then
    perform private.fail('A linha digitável só pode ser informada em boleto único', 'INVALID'); end if;
  if v_barcode is not null and exists (
      select 1 from public.bills where organization_id = v_org and barcode = v_barcode and status <> 'cancelled') then
    perform private.fail('Já existe um boleto com esta linha digitável', 'DUPLICATE_BARCODE'); end if;

  v_base := case when p_mode = 'installments' then p_amount_cents / v_n else p_amount_cents end;
  v_rem := case when p_mode = 'installments' then p_amount_cents % v_n else 0 end;
  v_ids := '{}';
  begin
    for i in 1..v_n loop
      v_amt := v_base + case when i <= v_rem then 1 else 0 end;
      v_due := case p_interval when 'month' then (p_first_due + make_interval(months => i - 1))::date
                               else p_first_due + (i - 1) * 7 end;
      insert into public.bills (organization_id, supplier_id, description, category_id, amount_cents, due_date,
        barcode, notes, series_id, series_kind, installment_no, installments_total, created_by)
      values (v_org, p_supplier_id, trim(p_description), p_category_id, v_amt, v_due,
        v_barcode, nullif(trim(coalesce(p_notes, '')), ''), p_request_id, p_mode, i, v_n, private.uid())
      returning id into v_id;
      v_ids := v_ids || v_id;
    end loop;
  exception when unique_violation then
    select array_agg(id order by installment_no) into v_ids from public.bills
    where organization_id = v_org and series_id = p_request_id;
    if v_ids is null then raise; end if;
  end;
  return v_ids;
end $$;

create function public.update_bill(
  p_bill_id uuid, p_supplier_id uuid, p_description text, p_category_id uuid,
  p_amount_cents bigint, p_due_date date, p_barcode text, p_notes text
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_b public.bills%rowtype; v_barcode text; v_status text; v_paid_on date;
begin
  v_org := private.require_admin();
  select * into v_b from public.bills where id = p_bill_id and organization_id = v_org for update;
  if not found then perform private.fail('Boleto não encontrado', 'NOT_FOUND'); end if;
  if v_b.status in ('paid', 'cancelled') then
    perform private.fail('Boleto pago ou cancelado não pode ser editado', 'LOCKED'); end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000000 then
    perform private.fail('Valor inválido', 'INVALID'); end if;
  if p_amount_cents < v_b.paid_cents then
    perform private.fail('O valor não pode ser menor que o já pago', 'INVALID'); end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and organization_id = v_org) then
    perform private.fail('Fornecedor inválido', 'INVALID'); end if;
  if p_category_id is not null and not exists (
      select 1 from public.expense_categories where id = p_category_id and organization_id = v_org and kind = 'expense') then
    perform private.fail('Categoria inválida', 'INVALID'); end if;
  v_barcode := private.clean_barcode(p_barcode);
  if v_barcode is not null and exists (
      select 1 from public.bills where organization_id = v_org and barcode = v_barcode and status <> 'cancelled' and id <> p_bill_id) then
    perform private.fail('Já existe um boleto com esta linha digitável', 'DUPLICATE_BARCODE'); end if;
  v_status := case when v_b.paid_cents = 0 then 'open' when v_b.paid_cents = p_amount_cents then 'paid' else 'partial' end;
  v_paid_on := case when v_status = 'paid' then private.local_date(v_org) else null end;
  update public.bills set supplier_id = p_supplier_id, description = trim(p_description), category_id = p_category_id,
    amount_cents = p_amount_cents, due_date = p_due_date, barcode = v_barcode,
    notes = nullif(trim(coalesce(p_notes, '')), ''), status = v_status, paid_on = v_paid_on
  where id = p_bill_id;
end $$;

create function public.cancel_bill(p_bill_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_b public.bills%rowtype;
begin
  v_org := private.require_admin();
  if length(trim(coalesce(p_reason, ''))) < 5 then perform private.fail('Informe o motivo do cancelamento', 'REASON_REQUIRED'); end if;
  select * into v_b from public.bills where id = p_bill_id and organization_id = v_org for update;
  if not found then perform private.fail('Boleto não encontrado', 'NOT_FOUND'); end if;
  if v_b.status = 'cancelled' then return; end if;
  if v_b.paid_cents > 0 then
    perform private.fail('Há pagamentos neste boleto. Cancele os pagamentos antes', 'HAS_PAYMENTS'); end if;
  update public.bills set status = 'cancelled', cancelled_by = private.uid(), cancelled_at = now(),
    cancel_reason = trim(p_reason) where id = p_bill_id;
end $$;

create function public.pay_bill(
  p_bill_id uuid, p_amount_cents bigint, p_paid_on date, p_account_id uuid, p_method text,
  p_note text, p_confirmed boolean, p_request_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_b public.bills%rowtype; v_acc public.accounts%rowtype; v_id uuid := gen_random_uuid();
  v_existing uuid; v_remaining bigint; v_new_paid bigint; v_supplier text; v_shift public.cash_shifts%rowtype;
  v_mov uuid; v_desc text; v_reg uuid;
begin
  v_org := private.require_admin();
  p_paid_on := coalesce(p_paid_on, private.local_date(v_org));
  select id into v_existing from public.bill_payments where organization_id = v_org and client_request_id = p_request_id;
  if found then return v_existing; end if;

  if not coalesce(p_confirmed, false) then
    perform private.fail('Confirme que o pagamento foi efetivamente realizado e conferido no banco', 'CONFIRM_REQUIRED'); end if;

  select * into v_b from public.bills where id = p_bill_id and organization_id = v_org for update;
  if not found then perform private.fail('Boleto não encontrado', 'NOT_FOUND'); end if;
  -- Repetição concorrente: após a trava, a mesma requisição devolve o pagamento já feito.
  select id into v_existing from public.bill_payments where organization_id = v_org and client_request_id = p_request_id;
  if found then return v_existing; end if;
  if v_b.status not in ('open', 'partial') then
    perform private.fail('Este boleto não está em aberto', 'NOT_OPEN'); end if;
  v_remaining := v_b.amount_cents - v_b.paid_cents;
  if p_amount_cents is null or p_amount_cents <= 0 then perform private.fail('Valor inválido', 'INVALID'); end if;
  if p_amount_cents > v_remaining then
    perform private.fail('O valor excede o saldo em aberto do boleto (' || private.fmt_brl(v_remaining) || ')', 'OVERPAYMENT'); end if;
  if p_method not in ('pix', 'boleto', 'dinheiro', 'transferencia', 'debito_automatico', 'outro') then
    perform private.fail('Forma de pagamento inválida', 'INVALID'); end if;
  if p_paid_on is null or p_paid_on > private.local_date(v_org) or p_paid_on < date '2000-01-01' then
    perform private.fail('Data do pagamento inválida (não pode ser futura)', 'INVALID'); end if;

  select * into v_acc from public.accounts where id = p_account_id and organization_id = v_org and active;
  if not found or v_acc.type = 'card_receivable' then
    perform private.fail('Escolha a conta de onde saiu o pagamento', 'INVALID'); end if;

  select s.name into v_supplier from public.suppliers s where s.id = v_b.supplier_id;
  v_desc := 'Boleto: ' || v_supplier || ' - ' || v_b.description;

  begin
    if v_acc.type = 'cash_drawer' then
      if p_method <> 'dinheiro' then perform private.fail('Pagamento pela gaveta deve ser em dinheiro', 'INVALID'); end if;
      if p_paid_on <> private.local_date(v_org) then
        perform private.fail('Pagamento em dinheiro pela gaveta deve ser lançado no dia, dentro do turno aberto', 'INVALID'); end if;
      select id into v_reg from public.registers where account_id = v_acc.id;
      select * into v_shift from public.cash_shifts where register_id = v_reg and status = 'open' for update;
      if not found then
        perform private.fail('Abra um turno nesta gaveta para registrar o pagamento em dinheiro', 'NO_OPEN_SHIFT'); end if;
      -- Um único lançamento: o razão recebe a saída pela movimentação do caixa.
      insert into public.bill_payments (id, organization_id, bill_id, amount_cents, paid_on, account_id, method, note,
        status, confirmed_by, client_request_id)
      values (v_id, v_org, p_bill_id, p_amount_cents, p_paid_on, p_account_id, p_method, left(p_note, 250),
        'posted', private.uid(), p_request_id);
      v_mov := private.insert_movement(v_org, v_shift, 'bill_payment', 'dinheiro', p_amount_cents, v_desc,
        v_b.category_id, null, null, gen_random_uuid(), false, v_id);
      update public.bill_payments set movement_id = v_mov where id = v_id;
    else
      insert into public.bill_payments (id, organization_id, bill_id, amount_cents, paid_on, account_id, method, note,
        status, confirmed_by, client_request_id)
      values (v_id, v_org, p_bill_id, p_amount_cents, p_paid_on, p_account_id, p_method, left(p_note, 250),
        'posted', private.uid(), p_request_id);
      perform private.post_entry(v_org, p_account_id, -p_amount_cents, 'expense', 'bill_payment', v_id, 1::smallint,
        gen_random_uuid(), v_desc, v_b.category_id, null,
        case when p_paid_on = private.local_date(v_org) then now()
             else p_paid_on::timestamp at time zone (select timezone from public.organizations where id = v_org) + interval '12 hours' end);
    end if;
  exception when unique_violation then
    select id into v_existing from public.bill_payments where organization_id = v_org and client_request_id = p_request_id;
    if v_existing is null then raise; end if;
    return v_existing;
  end;

  v_new_paid := v_b.paid_cents + p_amount_cents;
  update public.bills set paid_cents = v_new_paid,
    status = case when v_new_paid = amount_cents then 'paid' else 'partial' end,
    paid_on = case when v_new_paid = amount_cents then p_paid_on end
  where id = p_bill_id;
  return v_id;
end $$;

create function public.cancel_bill_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_p public.bill_payments%rowtype; v_b public.bills%rowtype; v_m public.cash_movements%rowtype;
  v_shift_status text; v_new_paid bigint;
begin
  v_org := private.require_admin();
  if length(trim(coalesce(p_reason, ''))) < 5 then perform private.fail('Informe o motivo do cancelamento', 'REASON_REQUIRED'); end if;
  select * into v_p from public.bill_payments where id = p_payment_id and organization_id = v_org;
  if not found then perform private.fail('Pagamento não encontrado', 'NOT_FOUND'); end if;
  select * into v_b from public.bills where id = v_p.bill_id for update;
  select * into v_p from public.bill_payments where id = p_payment_id for update;
  if v_p.status = 'cancelled' then return; end if;

  if v_p.movement_id is not null then
    select * into v_m from public.cash_movements where id = v_p.movement_id for update;
    select status into v_shift_status from public.cash_shifts where id = v_m.shift_id for update;
    if v_shift_status <> 'open' then
      perform private.fail('O turno deste pagamento em dinheiro já foi fechado. Registre um ajuste no turno atual', 'SHIFT_CLOSED'); end if;
    perform private.reverse_source(v_org, 'cash_movement', v_m.id, p_reason);
    update public.cash_movements set status = 'cancelled', cancelled_by = private.uid(), cancelled_at = now(),
      cancel_reason = trim(p_reason) where id = v_m.id;
  else
    perform private.reverse_source(v_org, 'bill_payment', v_p.id, p_reason);
  end if;

  update public.bill_payments set status = 'cancelled', cancelled_by = private.uid(), cancelled_at = now(),
    cancel_reason = trim(p_reason) where id = v_p.id;
  v_new_paid := v_b.paid_cents - v_p.amount_cents;
  update public.bills set paid_cents = v_new_paid,
    status = case when v_new_paid = 0 then 'open' else 'partial' end, paid_on = null
  where id = v_b.id;
end $$;

-- Registra um anexo já enviado ao Storage (valida existência real do objeto).
create function public.register_bill_file(
  p_bill_id uuid, p_payment_id uuid, p_kind text, p_path text, p_filename text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_bucket text; v_obj record; v_id uuid;
begin
  v_org := private.require_admin();
  if p_kind not in ('boleto', 'receipt') then perform private.fail('Tipo de anexo inválido', 'INVALID'); end if;
  if not exists (select 1 from public.bills where id = p_bill_id and organization_id = v_org) then
    perform private.fail('Boleto não encontrado', 'NOT_FOUND'); end if;
  if p_payment_id is not null and not exists (
      select 1 from public.bill_payments where id = p_payment_id and bill_id = p_bill_id and organization_id = v_org) then
    perform private.fail('Pagamento não encontrado', 'NOT_FOUND'); end if;
  if p_path not like v_org::text || '/' || p_bill_id::text || '/%' then
    perform private.fail('Caminho de arquivo inválido', 'INVALID'); end if;
  v_bucket := case p_kind when 'boleto' then 'boletos' else 'comprovantes' end;
  select o.name, coalesce((o.metadata ->> 'size')::bigint, 0) as size_bytes, o.metadata ->> 'mimetype' as mime
    into v_obj from storage.objects o where o.bucket_id = v_bucket and o.name = p_path;
  if not found then perform private.fail('Arquivo não encontrado no armazenamento. Envie novamente', 'FILE_MISSING'); end if;
  if v_obj.size_bytes <= 0 or v_obj.size_bytes > 10485760 then
    perform private.fail('Arquivo deve ter até 10 MB', 'INVALID'); end if;
  if v_obj.mime not in ('application/pdf', 'image/png', 'image/jpeg') then
    perform private.fail('Envie PDF, PNG ou JPG', 'INVALID'); end if;
  insert into public.bill_files (organization_id, bill_id, payment_id, kind, path, filename, mime, size_bytes, uploaded_by)
  values (v_org, p_bill_id, p_payment_id, p_kind, p_path, left(regexp_replace(p_filename, '[\r\n/\\]', '_', 'g'), 200),
          v_obj.mime, v_obj.size_bytes, private.uid())
  on conflict (path) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.bill_files where path = p_path; end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- RLS: contas a pagar são sigilosas (apenas proprietário e gerente)
-- ---------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.bills enable row level security;
alter table public.bill_payments enable row level security;
alter table public.bill_files enable row level security;
revoke all on public.suppliers, public.bills, public.bill_payments, public.bill_files from anon, authenticated;
grant select on public.suppliers, public.bills, public.bill_payments, public.bill_files to authenticated;

create policy suppliers_read on public.suppliers for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy bills_read on public.bills for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy bill_payments_read on public.bill_payments for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
create policy bill_files_read on public.bill_files for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin()));
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
-- =====================================================================
-- 0007_dashboard_reports — indicadores e relatórios (dados reais do banco)
-- =====================================================================
-- Definições (não misturar conceitos):
--   Faturamento      = lançamentos nature='revenue' (vendas e recebimentos de clientes)
--   Entradas do dia  = revenue + other_income        (transferências NÃO são entrada)
--   Saídas do dia    = expense + fee + refund        (transferências NÃO são saída)
--   Saldo em espécie = gaveta(s) + cofre(s)
--   Saldo bancário   = contas bancárias + Pix
--   Cartão a receber = contas "Cartão a receber" (vendas ainda não liquidadas)

create function public.dashboard_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid; v_today date; v_res jsonb;
begin
  v_org := private.require_admin();
  v_today := private.local_date(v_org);
  select jsonb_build_object(
    'today', v_today,
    'today_in_cents', coalesce(sum(l.amount_cents) filter (where l.occurred_on = v_today and l.nature in ('revenue', 'other_income')), 0),
    'today_out_cents', coalesce(-sum(l.amount_cents) filter (where l.occurred_on = v_today and l.nature in ('expense', 'fee', 'refund')), 0),
    'today_sales_cents', coalesce(sum(l.amount_cents) filter (where l.occurred_on = v_today and l.nature = 'revenue'), 0),
    'period_sales_cents', coalesce(sum(l.amount_cents) filter (where l.occurred_on between p_from and p_to and l.nature = 'revenue'), 0),
    'period_refunds_cents', coalesce(-sum(l.amount_cents) filter (where l.occurred_on between p_from and p_to and l.nature = 'refund'), 0),
    'period_expenses_cents', coalesce(-sum(l.amount_cents) filter (where l.occurred_on between p_from and p_to and l.nature in ('expense', 'fee')), 0),
    'period_other_in_cents', coalesce(sum(l.amount_cents) filter (where l.occurred_on between p_from and p_to and l.nature = 'other_income'), 0),
    'period_cash_diff_cents', coalesce(sum(l.amount_cents) filter (where l.occurred_on between p_from and p_to and l.nature = 'cash_difference'), 0),
    'cash_balance_cents', coalesce(sum(l.amount_cents) filter (where a.type in ('cash_drawer', 'safe')), 0),
    'bank_balance_cents', coalesce(sum(l.amount_cents) filter (where a.type in ('bank', 'pix')), 0),
    'card_receivable_cents', coalesce(sum(l.amount_cents) filter (where a.type = 'card_receivable'), 0)
  ) into v_res
  from public.ledger_entries l join public.accounts a on a.id = l.account_id
  where l.organization_id = v_org;

  return v_res || (select jsonb_build_object(
    'payables_open_cents', coalesce(sum(b.amount_cents - b.paid_cents), 0),
    'payables_open_count', count(*),
    'payables_overdue_cents', coalesce(sum(b.amount_cents - b.paid_cents) filter (where b.due_date < v_today), 0),
    'payables_overdue_count', count(*) filter (where b.due_date < v_today),
    'payables_due_7d_cents', coalesce(sum(b.amount_cents - b.paid_cents) filter (where b.due_date between v_today and v_today + 7), 0),
    'payables_due_today_cents', coalesce(sum(b.amount_cents - b.paid_cents) filter (where b.due_date = v_today), 0))
    from public.bills b where b.organization_id = v_org and b.status in ('open', 'partial'))
  || (select jsonb_build_object(
    'receivables_open_cents', coalesce(sum(r.amount_cents), 0),
    'receivables_overdue_cents', coalesce(sum(r.amount_cents) filter (where r.due_date < v_today), 0))
    from public.receivables r where r.organization_id = v_org and r.status = 'open')
  || (select jsonb_build_object(
    'open_shifts', coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'employee', p.full_name, 'register', rg.name, 'opened_at', s.opened_at,
        'expected_cents', private.shift_expected_cents(s.id))), '[]'::jsonb))
    from public.cash_shifts s join public.profiles p on p.id = s.employee_id
    join public.registers rg on rg.id = s.register_id
    where s.organization_id = v_org and s.status = 'open')
  || (select jsonb_build_object(
    'pending_movement_reviews', count(*) filter (where true))
    from public.cash_movements m where m.organization_id = v_org and m.review_status = 'pending')
  || (select jsonb_build_object(
    'pending_shift_reviews', count(*),
    'shifts_with_diff_period', count(*) filter (where s.difference_cents <> 0
        and private.local_date(v_org, s.closed_at) between p_from and p_to))
    from public.cash_shifts s where s.organization_id = v_org and s.status = 'closed' and s.review_status = 'pending');
end $$;

create function public.dashboard_series(p_from date, p_to date, p_bucket text)
returns table (bucket date, sales bigint, other_in bigint, expenses bigint, refunds bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_admin();
  if p_bucket not in ('day', 'week', 'month') then perform private.fail('Agrupamento inválido', 'INVALID'); end if;
  return query
    with days as (
      select (case p_bucket when 'day' then g::date
                            when 'week' then date_trunc('week', g)::date
                            else date_trunc('month', g)::date end) as b
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g
      group by 1)
    select d.b,
      coalesce(sum(l.amount_cents) filter (where l.nature = 'revenue'), 0)::bigint,
      coalesce(sum(l.amount_cents) filter (where l.nature = 'other_income'), 0)::bigint,
      coalesce(-sum(l.amount_cents) filter (where l.nature in ('expense', 'fee')), 0)::bigint,
      coalesce(-sum(l.amount_cents) filter (where l.nature = 'refund'), 0)::bigint
    from days d
    left join public.ledger_entries l on l.organization_id = v_org and l.occurred_on between p_from and p_to
      and (case p_bucket when 'day' then l.occurred_on
                         when 'week' then date_trunc('week', l.occurred_on)::date
                         else date_trunc('month', l.occurred_on)::date end) = d.b
    group by d.b order by d.b;
end $$;

-- ---------------------------------------------------------------------
-- Relatórios — devolvem linhas em JSON; colunas/formatos ficam no app.
-- ---------------------------------------------------------------------
create function public.report_data(
  p_report text, p_from date, p_to date, p_employee uuid default null, p_kind text default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_today date; v_rows jsonb;
begin
  v_org := private.require_admin();
  v_today := private.local_date(v_org);
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 1100 then
    perform private.fail('Período inválido', 'INVALID'); end if;

  if p_report = 'daily_close' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.opened_at), '[]') into v_rows from (
      select s.id as shift_id, s.opened_at, s.closed_at, p.full_name as employee, r.name as register,
        s.opening_cents,
        coalesce(sum(m.amount_cents) filter (where m.kind = 'sale' and m.payment_method = 'dinheiro'), 0) as sales_dinheiro,
        coalesce(sum(m.amount_cents) filter (where m.kind = 'sale' and m.payment_method = 'pix'), 0) as sales_pix,
        coalesce(sum(m.amount_cents) filter (where m.kind = 'sale' and m.payment_method = 'debito'), 0) as sales_debito,
        coalesce(sum(m.amount_cents) filter (where m.kind = 'sale' and m.payment_method = 'credito'), 0) as sales_credito,
        coalesce(sum(m.amount_cents) filter (where m.kind = 'sale' and m.payment_method = 'transferencia'), 0) as sales_transferencia,
        coalesce(sum(m.amount_cents) filter (where m.kind = 'supply'), 0) as supply_cents,
        coalesce(sum(m.amount_cents) filter (where m.kind = 'withdrawal'), 0) as withdrawal_cents,
        coalesce(sum(m.amount_cents) filter (where m.kind in ('expense', 'bill_payment')), 0) as expense_cents,
        case when s.status = 'closed' then s.expected_cents else private.shift_expected_cents(s.id) end as expected_cents,
        s.counted_cents, s.difference_cents, s.status, s.review_status, s.close_justification
      from public.cash_shifts s
      join public.profiles p on p.id = s.employee_id
      join public.registers r on r.id = s.register_id
      left join public.cash_movements m on m.shift_id = s.id and m.status = 'posted'
      where s.organization_id = v_org and private.local_date(v_org, s.opened_at) between p_from and p_to
        and (p_employee is null or s.employee_id = p_employee)
      group by s.id, p.full_name, r.name
      limit 5000) t;

  elsif p_report = 'monthly_close' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.day), '[]') into v_rows from (
      select l.occurred_on as day,
        coalesce(sum(l.amount_cents) filter (where l.nature = 'revenue'), 0) as sales_cents,
        coalesce(sum(l.amount_cents) filter (where l.nature = 'other_income'), 0) as other_in_cents,
        coalesce(-sum(l.amount_cents) filter (where l.nature = 'refund'), 0) as refunds_cents,
        coalesce(-sum(l.amount_cents) filter (where l.nature in ('expense', 'fee')), 0) as expenses_cents,
        coalesce(sum(l.amount_cents) filter (where l.nature = 'cash_difference'), 0) as cash_diff_cents,
        coalesce(sum(l.amount_cents) filter (where l.nature in ('revenue', 'other_income')), 0)
          + coalesce(sum(l.amount_cents) filter (where l.nature in ('refund', 'expense', 'fee')), 0) as result_cents
      from public.ledger_entries l
      where l.organization_id = v_org and l.occurred_on between p_from and p_to
      group by l.occurred_on) t;

  elsif p_report = 'sales_by_employee' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.total_cents desc), '[]') into v_rows from (
      select p.full_name as employee, count(*)::int as sales_count, sum(m.amount_cents) as total_cents,
        coalesce(sum(m.amount_cents) filter (where m.payment_method = 'dinheiro'), 0) as dinheiro,
        coalesce(sum(m.amount_cents) filter (where m.payment_method = 'pix'), 0) as pix,
        coalesce(sum(m.amount_cents) filter (where m.payment_method = 'debito'), 0) as debito,
        coalesce(sum(m.amount_cents) filter (where m.payment_method = 'credito'), 0) as credito,
        coalesce(sum(m.amount_cents) filter (where m.payment_method = 'transferencia'), 0) as transferencia
      from public.cash_movements m
      join public.cash_shifts s on s.id = m.shift_id
      join public.profiles p on p.id = s.employee_id
      where m.organization_id = v_org and m.kind = 'sale' and m.status = 'posted'
        and private.local_date(v_org, m.created_at) between p_from and p_to
        and (p_employee is null or s.employee_id = p_employee)
      group by p.full_name) t;

  elsif p_report = 'sales_by_method' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.total_cents desc), '[]') into v_rows from (
      select m.payment_method as method, count(*)::int as sales_count, sum(m.amount_cents) as total_cents
      from public.cash_movements m join public.cash_shifts s on s.id = m.shift_id
      where m.organization_id = v_org and m.kind = 'sale' and m.status = 'posted'
        and private.local_date(v_org, m.created_at) between p_from and p_to
        and (p_employee is null or s.employee_id = p_employee)
      group by m.payment_method) t;

  elsif p_report = 'entries_exits' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]') into v_rows from (
      select m.id, m.created_at, p.full_name as employee, m.kind, m.payment_method as method, m.direction,
        case when m.direction = 'in' then m.amount_cents else -m.amount_cents end as amount_cents,
        m.description, m.status, m.review_status, c.name as category
      from public.cash_movements m
      join public.cash_shifts s on s.id = m.shift_id
      join public.profiles p on p.id = s.employee_id
      left join public.expense_categories c on c.id = m.category_id
      where m.organization_id = v_org and private.local_date(v_org, m.created_at) between p_from and p_to
        and (p_employee is null or s.employee_id = p_employee)
        and (p_kind is null or p_kind = '' or m.kind = p_kind or m.direction = p_kind)
      order by m.created_at desc limit 5000) t;

  elsif p_report = 'expenses_by_category' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.total_cents desc), '[]') into v_rows from (
      select coalesce(c.name, 'Sem categoria') as category, count(*) filter (where not l.is_reversal)::int as entries_count,
        -sum(l.amount_cents) as total_cents
      from public.ledger_entries l left join public.expense_categories c on c.id = l.category_id
      where l.organization_id = v_org and l.nature in ('expense', 'fee')
        and l.occurred_on between p_from and p_to
      group by coalesce(c.name, 'Sem categoria')
      having -sum(l.amount_cents) <> 0) t;

  elsif p_report = 'bills' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.due_date), '[]') into v_rows from (
      select b.id, b.due_date, sp.name as supplier, b.description, c.name as category, b.amount_cents, b.paid_cents,
        b.amount_cents - b.paid_cents as remaining_cents, b.paid_on,
        case when b.status = 'cancelled' then 'cancelled'
             when b.status = 'paid' then 'paid'
             when b.due_date < v_today then 'overdue'
             when b.status = 'partial' then 'partial' else 'open' end as situation
      from public.bills b join public.suppliers sp on sp.id = b.supplier_id
      left join public.expense_categories c on c.id = b.category_id
      where b.organization_id = v_org
        and ((p_kind = 'paid' and b.status = 'paid' and b.paid_on between p_from and p_to)
          or (coalesce(p_kind, 'all') <> 'paid' and b.due_date between p_from and p_to
              and (coalesce(p_kind, 'all') = 'all'
                or (p_kind = 'pending' and b.status in ('open', 'partial') and b.due_date >= v_today)
                or (p_kind = 'overdue' and b.status in ('open', 'partial') and b.due_date < v_today))))
      limit 5000) t;

  elsif p_report = 'cash_flow' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.day), '[]') into v_rows from (
      with liquid as (
        select l.* from public.ledger_entries l join public.accounts a on a.id = l.account_id
        where l.organization_id = v_org and a.type in ('cash_drawer', 'safe', 'bank', 'pix') and l.occurred_on <= p_to
          and not (l.nature = 'transfer' and exists (
            select 1 from public.ledger_entries l2 join public.accounts a2 on a2.id = l2.account_id
            where l2.group_id = l.group_id and l2.id <> l.id and l2.nature = 'transfer'
              and a2.type in ('cash_drawer', 'safe', 'bank', 'pix')))),
      daily as (
        select occurred_on as day,
          coalesce(sum(amount_cents) filter (where amount_cents > 0), 0) as inflow_cents,
          coalesce(-sum(amount_cents) filter (where amount_cents < 0), 0) as outflow_cents,
          sum(amount_cents) as net_cents
        from liquid group by occurred_on),
      running as (select d.*, sum(net_cents) over (order by day) as balance_cents from daily d)
      select * from running where day >= p_from) t;

  elsif p_report = 'discrepancies' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]') into v_rows from (
      select s.id as shift_id, s.closed_at as at, 'Fechamento' as origin, p.full_name as employee,
        s.expected_cents, s.counted_cents, s.difference_cents, s.close_justification as justification, s.review_status
      from public.cash_shifts s join public.profiles p on p.id = s.employee_id
      where s.organization_id = v_org and s.status = 'closed' and s.difference_cents <> 0
        and private.local_date(v_org, s.closed_at) between p_from and p_to
        and (p_employee is null or s.employee_id = p_employee)
      union all
      select s.id, s.opened_at, 'Passagem de turno', p.full_name, s.handoff_expected_cents, s.opening_cents,
        s.handoff_difference_cents, s.handoff_note, s.review_status
      from public.cash_shifts s join public.profiles p on p.id = s.employee_id
      where s.organization_id = v_org and s.handoff_difference_cents is distinct from 0 and s.handoff_difference_cents is not null
        and private.local_date(v_org, s.opened_at) between p_from and p_to
        and (p_employee is null or s.employee_id = p_employee)) t;

  elsif p_report = 'operations_history' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]') into v_rows from (
      select a.id, a.created_at, coalesce(p.full_name, 'Sistema') as actor, a.action, a.entity_type, a.entity_id,
        a.reason, a.before, a.after
      from public.audit_log a left join public.profiles p on p.id = a.actor_id
      where a.organization_id = v_org and private.local_date(v_org, a.created_at) between p_from and p_to
        and (p_employee is null or a.actor_id = p_employee)
        and (p_kind is null or p_kind = '' or a.entity_type = p_kind)
      order by a.created_at desc limit 5000) t;
  else
    perform private.fail('Relatório desconhecido', 'INVALID');
  end if;
  return v_rows;
end $$;
-- =====================================================================
-- 0008_storage — buckets PRIVADOS para boletos e comprovantes
-- =====================================================================
-- Estrutura do caminho: {organization_id}/{bill_id}/{uuid}-{arquivo}
-- Somente proprietário/gerente da MESMA empresa lê ou envia. Não existe
-- política de update; remoção só de arquivos órfãos (nunca de anexos já
-- registrados em bill_files), preservando a trilha de auditoria.
-- Os links de leitura são URLs assinadas e temporárias (120 s).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('boletos', 'boletos', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg']),
  ('comprovantes', 'comprovantes', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy financeiro_files_read on storage.objects for select to authenticated
using (bucket_id in ('boletos', 'comprovantes')
  and (select private.is_admin())
  and (storage.foldername(name))[1] = (select private.current_org_id())::text);

create policy financeiro_files_insert on storage.objects for insert to authenticated
with check (bucket_id in ('boletos', 'comprovantes')
  and (select private.is_admin())
  and (storage.foldername(name))[1] = (select private.current_org_id())::text
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$');

create policy financeiro_files_delete_orphans on storage.objects for delete to authenticated
using (bucket_id in ('boletos', 'comprovantes')
  and (select private.is_admin())
  and (storage.foldername(name))[1] = (select private.current_org_id())::text
  and not exists (select 1 from public.bill_files f where f.path = name));
-- =====================================================================
-- 0009_bootstrap_and_grants — cadastro inicial da empresa e privilégios
-- =====================================================================

-- Dados padrão de uma empresa nova (caixa, contas, rotas e categorias).
create function private.seed_org_defaults(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cash uuid := gen_random_uuid(); v_bank uuid := gen_random_uuid(); v_pix uuid := gen_random_uuid();
  v_card uuid := gen_random_uuid(); v_safe uuid := gen_random_uuid();
begin
  insert into public.accounts (id, organization_id, name, type) values
    (v_cash, p_org, 'Gaveta - Caixa principal', 'cash_drawer'),
    (v_safe, p_org, 'Cofre', 'safe'),
    (v_bank, p_org, 'Conta bancária', 'bank'),
    (v_pix, p_org, 'Conta Pix', 'pix'),
    (v_card, p_org, 'Cartão a receber', 'card_receivable');
  insert into public.registers (organization_id, name, account_id) values (p_org, 'Caixa principal', v_cash);
  insert into public.payment_routes (organization_id, payment_method, account_id) values
    (p_org, 'pix', v_pix), (p_org, 'debito', v_card), (p_org, 'credito', v_card), (p_org, 'transferencia', v_bank);
  insert into public.expense_categories (organization_id, name, kind) values
    (p_org, 'Fornecedores / Mercadoria', 'expense'), (p_org, 'Aluguel', 'expense'),
    (p_org, 'Energia elétrica', 'expense'), (p_org, 'Água', 'expense'),
    (p_org, 'Internet / Telefone', 'expense'), (p_org, 'Folha de pagamento', 'expense'),
    (p_org, 'Impostos e taxas', 'expense'), (p_org, 'Frete', 'expense'),
    (p_org, 'Manutenção', 'expense'), (p_org, 'Combustível', 'expense'),
    (p_org, 'Material de limpeza / escritório', 'expense'), (p_org, 'Taxas de cartão', 'expense'),
    (p_org, 'Outras despesas', 'expense'),
    (p_org, 'Recebimento de clientes', 'income'), (p_org, 'Outras receitas', 'income');
end $$;

-- Estado do cadastro inicial: só é necessário enquanto não existe nenhum perfil.
create function public.svc_setup_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('needs_setup', not exists (select 1 from public.profiles))
$$;

-- Cria (ou reaproveita, se a tentativa anterior falhou no meio) a empresa e o
-- convite do proprietário. Chamada SOMENTE pelo servidor com a service role,
-- que em seguida cria o login; o gatilho de auth.users gera o perfil.
create function public.svc_bootstrap_organization(p_org_name text, p_owner_email text, p_owner_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if exists (select 1 from public.profiles) then
    perform private.fail('A empresa já foi configurada', 'SETUP_DONE'); end if;
  select id into v_org from public.organizations order by created_at limit 1 for update;
  if v_org is null then
    insert into public.organizations (name) values (trim(p_org_name)) returning id into v_org;
    perform private.seed_org_defaults(v_org);
  else
    update public.organizations set name = trim(p_org_name) where id = v_org;
    delete from public.invitations where organization_id = v_org and accepted_at is null;
  end if;
  insert into public.invitations (organization_id, email, full_name, role, must_change_password)
  values (v_org, lower(trim(p_owner_email)), trim(p_owner_name), 'owner', false);
  return v_org;
end $$;

-- Remove convite pendente quando a criação do login falhou (service role).
create function public.svc_discard_invitation(p_email text) returns void
language sql security definer set search_path = '' as $$
  delete from public.invitations where lower(email) = lower(p_email) and accepted_at is null
$$;

-- Lista de destinatários de e-mail ainda sem entrega (service role / agendador).
create function public.svc_pending_email_digest()
returns table (user_id uuid, email text, full_name text, notification_id uuid, title text, body text, severity text, link text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.full_name, n.id, n.title, n.body, n.severity, n.link
  from public.profiles p
  join public.notifications n on n.organization_id = p.organization_id
  where p.active and p.email_notifications and p.role in ('owner', 'manager')
    and n.resolved_at is null and n.severity in ('warning', 'critical')
    and n.created_at > now() - interval '3 days'
    and not exists (select 1 from public.notification_deliveries d
                    where d.notification_id = n.id and d.user_id = p.id and d.channel = 'email' and d.status = 'sent')
  order by p.id, n.created_at
$$;

create function public.svc_record_delivery(p_notification_id uuid, p_user_id uuid, p_status text, p_error text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notification_deliveries (notification_id, user_id, channel, status, error)
  values (p_notification_id, p_user_id, 'email', p_status, left(p_error, 500))
  on conflict do nothing
$$;

-- ---------------------------------------------------------------------
-- Privilégios de execução (default-deny)
--   * funções `public.*`: somente `authenticated` (exceto `svc_*`: só service_role)
--   * funções `private.*`: ninguém, exceto os helpers usados nas políticas RLS
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname, n.nspname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' and f.proname like 'svc\_%' then
      execute format('grant execute on function %s to service_role', f.sig);
    elsif f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.proname in ('uid', 'current_org_id', 'my_role', 'is_admin', 'is_owner') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- A service role precisa ler/gravar o necessário para o cadastro inicial e o
-- agendador; as tabelas continuam fechadas para anon.
grant usage on schema private to service_role;
