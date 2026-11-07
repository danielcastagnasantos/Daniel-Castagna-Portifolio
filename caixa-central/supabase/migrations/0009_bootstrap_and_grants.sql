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
