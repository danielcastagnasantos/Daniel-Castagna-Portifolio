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
