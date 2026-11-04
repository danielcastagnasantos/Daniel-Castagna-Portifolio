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
