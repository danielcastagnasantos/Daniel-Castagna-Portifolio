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
