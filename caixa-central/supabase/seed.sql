-- =====================================================================
-- seed.sql — DADOS FICTÍCIOS, SOMENTE PARA DESENVOLVIMENTO LOCAL
-- =====================================================================
-- Executado automaticamente por `supabase db reset` (ambiente local).
-- NUNCA aplique este arquivo em produção: ele cria usuários com senha conhecida e
-- movimentações inventadas. Se já existir qualquer perfil, não faz nada.
--
-- Logins (senha de todos: Dev-Senha-123)
--   dono@dev.local · gerente@dev.local · ana@dev.local · bruno@dev.local

do $seed$
declare
  v_org uuid; v_pw text := extensions.crypt('Dev-Senha-123', extensions.gen_salt('bf'));
  v_owner uuid := '10000000-0000-4000-8000-000000000001'; v_mgr uuid := '10000000-0000-4000-8000-000000000002';
  v_ana uuid := '10000000-0000-4000-8000-000000000003'; v_bruno uuid := '10000000-0000-4000-8000-000000000004';
  v_reg uuid; v_bank uuid; v_safe uuid; v_cat uuid; v_sup uuid; v_bills uuid[]; v_shift uuid; r record;
begin
  if exists (select 1 from public.profiles) then
    raise notice 'seed ignorado: já existem perfis'; return;
  end if;

  v_org := public.svc_bootstrap_organization('Distribuidora Dev (dados fictícios)', 'dono@dev.local', 'Carlos (dev)');
  -- Convites para a equipe; o gatilho de auth.users cria os perfis.
  insert into public.invitations (organization_id, email, full_name, role, must_change_password) values
    (v_org, 'gerente@dev.local', 'Daniel (dev)', 'manager', false),
    (v_org, 'ana@dev.local', 'Ana Souza (dev)', 'cashier', false),
    (v_org, 'bruno@dev.local', 'Bruno Lima (dev)', 'cashier', false);
  for r in select * from (values (v_owner, 'dono@dev.local'), (v_mgr, 'gerente@dev.local'), (v_ana, 'ana@dev.local'), (v_bruno, 'bruno@dev.local')) t(id, email) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email, v_pw, now(),
      '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at)
    values (r.id::text, r.id, jsonb_build_object('sub', r.id::text, 'email', r.email), 'email', now());
  end loop;

  select id into v_reg from public.registers where organization_id = v_org limit 1;
  select id into v_bank from public.accounts where organization_id = v_org and type = 'bank';
  select id into v_safe from public.accounts where organization_id = v_org and type = 'safe';
  select id into v_cat from public.expense_categories where organization_id = v_org and name = 'Fornecedores / Mercadoria';

  -- Gerente cadastra fornecedor e boletos
  perform set_config('request.jwt.claim.sub', v_mgr::text, true); set local role authenticated;
  v_sup := public.upsert_supplier(null, 'Ambev Distribuição (fictício)', null, null, null, null, true);
  v_bills := public.create_bills(v_sup, 'Pedido 4521 — cerveja', v_cat, 1850000, current_date + 5, 'single', 1, 'month', null, null, gen_random_uuid());
  perform public.create_bills(v_sup, 'Pedido 4388 — vencido', v_cat, 920000, current_date - 3, 'single', 1, 'month', null, null, gen_random_uuid());
  perform public.create_bills(v_sup, 'Compra parcelada (3x)', v_cat, 900000, current_date + 10, 'installments', 3, 'month', null, null, gen_random_uuid());
  perform public.post_account_adjustment(v_bank, 5000000, 'Saldo inicial de desenvolvimento (fictício)', gen_random_uuid());
  perform public.pay_bill(v_bills[1], 500000, current_date, v_bank, 'pix', 'Pagamento parcial (dev)', true, gen_random_uuid());
  reset role;

  -- Ana: turno com o exemplo do enunciado (200 + 500 din + 300 pix − 100 sangria; contou 580 => -20)
  perform set_config('request.jwt.claim.sub', v_ana::text, true); set local role authenticated;
  v_shift := public.open_cash_shift(v_reg, 20000, null, gen_random_uuid());
  perform public.create_cash_movement(v_shift, 'sale', 'dinheiro', 50000, null, null, null, gen_random_uuid());
  perform public.create_cash_movement(v_shift, 'sale', 'pix', 30000, null, null, null, gen_random_uuid());
  perform public.create_cash_movement(v_shift, 'sale', 'credito', 45000, null, null, null, gen_random_uuid());
  perform public.create_cash_movement(v_shift, 'withdrawal', 'dinheiro', 10000, 'Sangria para o cofre', null, v_safe, gen_random_uuid());
  perform public.close_cash_shift(v_shift, 58000, 'Troco devolvido a mais (dev)', gen_random_uuid());
  reset role;

  -- Bruno: turno aberto agora
  perform set_config('request.jwt.claim.sub', v_bruno::text, true); set local role authenticated;
  v_shift := public.open_cash_shift(v_reg, 58000, null, gen_random_uuid());
  perform public.create_cash_movement(v_shift, 'sale', 'dinheiro', 12500, null, null, null, gen_random_uuid());
  perform public.create_cash_movement(v_shift, 'sale', 'debito', 8900, null, null, null, gen_random_uuid());
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'seed de desenvolvimento aplicado (logins dev em supabase/seed.sql)';
end
$seed$;
