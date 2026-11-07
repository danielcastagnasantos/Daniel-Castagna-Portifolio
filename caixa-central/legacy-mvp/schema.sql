-- CAIXA CENTRAL: esquema inicial com controle de acesso por empresa e função.
-- Executar UMA vez no SQL Editor de um projeto Supabase vazio.
-- Não execute este arquivo repetidamente em um banco com dados de produção.

create extension if not exists pgcrypto;
create schema if not exists private;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  full_name text not null check(length(trim(full_name)) between 2 and 120),
  role text not null check(role in ('owner','manager','cashier')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index profiles_org_idx on public.profiles (organization_id);

create table public.registers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check(length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);
create index registers_org_idx on public.registers (organization_id);

create table public.cash_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  register_id uuid not null references public.registers(id),
  employee_id uuid not null references public.profiles(id),
  opened_at timestamptz not null default now(),
  opening_cash numeric(12,2) not null check(opening_cash >= 0),
  status text not null default 'open' check(status in ('open','closed')),
  closed_at timestamptz,
  counted_cash numeric(12,2) check(counted_cash >= 0),
  expected_cash numeric(12,2),
  difference numeric(12,2),
  handoff_difference numeric(12,2),
  handoff_note text,
  constraint shift_close_consistency check (
    (status='open' and closed_at is null and counted_cash is null and expected_cash is null and difference is null)
    or (status='closed' and closed_at is not null and counted_cash is not null and expected_cash is not null and difference is not null)
  )
);
-- Uma única pessoa pode manter a gaveta aberta de cada vez.
create unique index one_open_shift_per_register on public.cash_shifts(register_id) where status='open';
create index shifts_org_idx on public.cash_shifts(organization_id, opened_at desc);
create index shifts_owner_idx on public.cash_shifts(employee_id, opened_at desc);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  shift_id uuid not null references public.cash_shifts(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  direction text not null check(direction in ('in','out')),
  category text not null check(category in ('venda','entrada','despesa','retirada','estorno')),
  payment_method text not null check(payment_method in ('dinheiro','pix','debito','credito','transferencia')),
  amount numeric(12,2) not null check(amount > 0),
  description text check(length(description) <= 250),
  constraint movement_direction_matches_type check(
    (direction='in' and category in ('venda','entrada')) or
    (direction='out' and category in ('despesa','retirada','estorno'))
  )
);
create index movements_org_day_idx on public.cash_movements(organization_id, created_at desc);
create index movements_shift_idx on public.cash_movements(shift_id);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  created_by uuid not null references public.profiles(id),
  supplier text not null check(length(trim(supplier)) between 2 and 140),
  amount numeric(12,2) not null check(amount > 0),
  due_date date not null,
  status text not null default 'pending' check(status in ('pending','paid')),
  paid_at timestamptz,
  notes text check(length(notes)<=500),
  attachment_path text,
  created_at timestamptz not null default now(),
  constraint bill_payment_consistency check(
    (status='pending' and paid_at is null) or
    (status='paid' and paid_at is not null)
  )
);
create index bills_org_due_idx on public.bills(organization_id, due_date);

create table public.bill_status_audit (
  id bigint generated always as identity primary key,
  bill_id uuid not null references public.bills(id),
  organization_id uuid not null references public.organizations(id),
  previous_status text not null,
  next_status text not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index bill_audit_org_idx on public.bill_status_audit(organization_id, changed_at desc);

-- Evita recursão de RLS ao consultar o perfil do usuário.
create or replace function private.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.organization_id from public.profiles p
  where p.id=(select auth.uid()) and p.active=true limit 1
$$;
create or replace function private.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id=(select auth.uid()) and p.active=true limit 1
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role in ('owner','manager') from public.profiles p
    where p.id=(select auth.uid()) and p.active=true limit 1),false)
$$;

-- As funções sensíveis são privadas: só os wrappers públicos ficam visíveis pela API.
create or replace function private.open_cash_shift(
  p_register_id uuid, p_opening_cash numeric, p_handoff_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_shift uuid; v_previous numeric(12,2);
begin
  v_org := private.current_org_id();
  if v_org is null then raise exception 'Usuário sem acesso ativo'; end if;
  if p_opening_cash is null or p_opening_cash < 0 or p_opening_cash > 9999999999 then
    raise exception 'Saldo inicial inválido';
  end if;
  if not exists(select 1 from public.registers where id=p_register_id and organization_id=v_org) then
    raise exception 'Gaveta não encontrada para sua empresa';
  end if;
  if exists(select 1 from public.cash_shifts where register_id=p_register_id and status='open') then
    raise exception 'Há um turno aberto nessa gaveta. Feche-o antes de iniciar o próximo';
  end if;
  select counted_cash into v_previous from public.cash_shifts
  where register_id=p_register_id and status='closed' order by closed_at desc limit 1;
  if v_previous is not null and v_previous <> p_opening_cash and
     length(trim(coalesce(p_handoff_note,''))) < 4 then
    raise exception 'A abertura difere da última contagem. Informe o motivo na observação';
  end if;
  insert into public.cash_shifts (
    organization_id, register_id, employee_id, opening_cash,
    handoff_difference, handoff_note
  ) values (
    v_org, p_register_id, (select auth.uid()), p_opening_cash,
    case when v_previous is null then null else p_opening_cash-v_previous end,
    nullif(trim(coalesce(p_handoff_note,'')),'')
  ) returning id into v_shift;
  return v_shift;
end;
$$;

create or replace function private.close_cash_shift(
  p_shift_id uuid, p_counted_cash numeric
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_shift public.cash_shifts%rowtype; v_expected numeric(12,2);
begin
  if p_counted_cash is null or p_counted_cash < 0 or p_counted_cash > 9999999999 then
    raise exception 'Dinheiro contado inválido';
  end if;
  select * into v_shift from public.cash_shifts where id=p_shift_id for update;
  if not found or v_shift.organization_id is distinct from private.current_org_id() then
    raise exception 'Turno não encontrado';
  end if;
  if v_shift.status <> 'open' then raise exception 'Este turno já está fechado'; end if;
  if v_shift.employee_id <> (select auth.uid()) and not private.is_admin() then
    raise exception 'Apenas o responsável ou gerente pode fechar este turno';
  end if;
  select v_shift.opening_cash + coalesce(sum(
    case when direction='in' then amount else -amount end
  ),0) into v_expected
  from public.cash_movements where shift_id=p_shift_id and payment_method='dinheiro';
  update public.cash_shifts set status='closed', closed_at=now(),
    counted_cash=p_counted_cash, expected_cash=v_expected,
    difference=p_counted_cash-v_expected where id=p_shift_id;
end;
$$;

-- Essa trava serializa lançamentos e encerramentos simultâneos do mesmo turno.
create or replace function private.guard_cash_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.cash_shifts s
  where s.id=new.shift_id and s.organization_id=new.organization_id and s.status='open'
  for update;
  if not found then raise exception 'Não é possível lançar em um turno fechado ou de outra empresa'; end if;
  return new;
end;
$$;
create trigger guard_cash_movement_before_insert
before insert on public.cash_movements for each row execute function private.guard_cash_movement();

create or replace function private.audit_bill_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status then
    insert into public.bill_status_audit(bill_id,organization_id,previous_status,next_status,changed_by)
    values(new.id,new.organization_id,old.status,new.status,(select auth.uid()));
  end if;
  return new;
end;
$$;
create trigger audit_bill_status_after_update
  after update on public.bills for each row execute function private.audit_bill_status();

create or replace function public.open_cash_shift(
  p_register_id uuid, p_opening_cash numeric, p_handoff_note text default null
) returns uuid language sql security invoker set search_path='' as $$
  select private.open_cash_shift(p_register_id,p_opening_cash,p_handoff_note)
$$;
create or replace function public.close_cash_shift(
  p_shift_id uuid, p_counted_cash numeric
) returns void language sql security invoker set search_path='' as $$
  select private.close_cash_shift(p_shift_id,p_counted_cash)
$$;

-- Privilégios por operação; nenhuma escrita financeira permitida a usuários anônimos.
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.registers enable row level security;
alter table public.cash_shifts enable row level security;
alter table public.cash_movements enable row level security;
alter table public.bills enable row level security;
alter table public.bill_status_audit enable row level security;

revoke all on public.organizations, public.profiles, public.registers,
  public.cash_shifts, public.cash_movements, public.bills, public.bill_status_audit
  from anon, authenticated;
grant select on public.organizations,public.profiles,public.registers,
  public.cash_shifts,public.cash_movements,public.bills,public.bill_status_audit to authenticated;
grant insert (organization_id,shift_id,created_by,direction,category,payment_method,amount,description)
  on public.cash_movements to authenticated;
grant insert (organization_id,created_by,supplier,amount,due_date,notes,attachment_path)
  on public.bills to authenticated;
grant update (supplier,amount,due_date,status,paid_at,notes,attachment_path)
  on public.bills to authenticated;

revoke all on function private.current_org_id(), private.my_role(), private.is_admin() from public;
revoke all on function private.open_cash_shift(uuid,numeric,text),private.close_cash_shift(uuid,numeric) from public;
revoke all on function public.open_cash_shift(uuid,numeric,text), public.close_cash_shift(uuid,numeric) from public;
revoke all on schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.current_org_id(),private.my_role(),private.is_admin() to authenticated;
grant execute on function private.open_cash_shift(uuid,numeric,text),private.close_cash_shift(uuid,numeric) to authenticated;
grant execute on function public.open_cash_shift(uuid,numeric,text),public.close_cash_shift(uuid,numeric) to authenticated;

create policy org_read on public.organizations for select to authenticated
using (id=(select private.current_org_id()));
create policy profile_read on public.profiles for select to authenticated
using (id=(select auth.uid()) or (organization_id=(select private.current_org_id()) and (select private.is_admin())));
create policy register_read on public.registers for select to authenticated
using (organization_id=(select private.current_org_id()));
-- Todos veem o registro de turno: necessário para conferir a passagem de gaveta.
-- Apenas gerentes veem as movimentações dos demais operadores.
create policy shift_read on public.cash_shifts for select to authenticated
using (organization_id=(select private.current_org_id()));
create policy movement_read on public.cash_movements for select to authenticated
using (
  organization_id=(select private.current_org_id()) and
  ((select private.is_admin()) or exists (
     select 1 from public.cash_shifts s where s.id=shift_id and s.employee_id=(select auth.uid())
  ))
);
create policy movement_insert on public.cash_movements for insert to authenticated
with check (
  organization_id=(select private.current_org_id()) and created_by=(select auth.uid()) and
  exists(select 1 from public.cash_shifts s where s.id=shift_id
    and s.organization_id=organization_id and s.status='open' and
    ((select private.is_admin()) or (s.employee_id=(select auth.uid()) and category='venda' and direction='in')))
);
create policy bills_read on public.bills for select to authenticated
using (organization_id=(select private.current_org_id()) and (select private.is_admin()));
create policy bills_insert on public.bills for insert to authenticated
with check (organization_id=(select private.current_org_id()) and created_by=(select auth.uid()) and (select private.is_admin()));
create policy bills_update on public.bills for update to authenticated
using (organization_id=(select private.current_org_id()) and (select private.is_admin()))
with check (organization_id=(select private.current_org_id()) and (select private.is_admin()));
create policy bill_audit_read on public.bill_status_audit for select to authenticated
using (organization_id=(select private.current_org_id()) and (select private.is_admin()));

-- Armazenamento privado de PDFs/imagens: só pai e gerente têm leitura/gravação.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('boletos','boletos',false,10485760,array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;
create policy boletos_read on storage.objects for select to authenticated
using (bucket_id='boletos' and (select private.is_admin()) and (storage.foldername(name))[1]=(select private.current_org_id())::text);
create policy boletos_insert on storage.objects for insert to authenticated
with check (bucket_id='boletos' and (select private.is_admin()) and (storage.foldername(name))[1]=(select private.current_org_id())::text);
create policy boletos_delete on storage.objects for delete to authenticated
using (bucket_id='boletos' and (select private.is_admin()) and (storage.foldername(name))[1]=(select private.current_org_id())::text);
