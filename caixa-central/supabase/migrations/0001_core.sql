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
