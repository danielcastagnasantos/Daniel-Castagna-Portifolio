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
