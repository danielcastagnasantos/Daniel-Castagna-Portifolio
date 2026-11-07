-- =====================================================================
-- 0010_simple_cash — fechamento simplificado com TROCO FIXO na gaveta
-- =====================================================================
-- Rotina da loja: todo dia ficam R$ 150,00 de troco na gaveta na passagem de turno.
-- No fechamento o operador informa só os TOTAIS do turno (dinheiro, Pix, débito,
-- crédito, transferência), as despesas pagas em dinheiro (opcional) e o dinheiro
-- CONTADO. O sistema, numa única transação:
--   1. registra as vendas de cada forma de pagamento;
--   2. registra a despesa em dinheiro (se houver);
--   3. registra a retirada (sangria) do que passar do troco, para o cofre;
--   4. fecha o turno conferindo a gaveta (esperado × contado) e deixando o troco.
-- Tudo é aproveitado das regras já existentes (razão imutável, idempotência, auditoria).

alter table public.organizations
  add column change_fund_cents bigint not null default 15000
  check (change_fund_cents >= 0 and change_fund_cents <= 100000000);

create function public.set_change_fund(p_cents bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org := private.require_admin();
  if p_cents is null or p_cents < 0 or p_cents > 100000000 then
    perform private.fail('Valor do troco inválido', 'INVALID'); end if;
  update public.organizations set change_fund_cents = p_cents where id = v_org;
end $$;

create function public.close_shift_simple(
  p_shift_id uuid,
  p_cash_sales bigint, p_pix bigint, p_debit bigint, p_credit bigint, p_transfer bigint,
  p_expense_cents bigint, p_expense_note text,
  p_counted_cents bigint, p_justification text, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_shift public.cash_shifts%rowtype; v_fund bigint; v_withdraw bigint := 0;
  v_cat uuid; v_safe uuid; v_result jsonb; m record;
begin
  v_org := private.require_org();
  select * into v_shift from public.cash_shifts where id = p_shift_id and organization_id = v_org for update;
  if not found then perform private.fail('Turno não encontrado', 'NOT_FOUND'); end if;

  -- Repetição do mesmo pedido: devolve o resultado original sem lançar nada de novo.
  if v_shift.status = 'closed' then
    if v_shift.close_request_id = p_request_id then
      return public.close_cash_shift(p_shift_id, v_shift.counted_cents, null, p_request_id);
    end if;
    perform private.fail('Este turno já está fechado', 'SHIFT_CLOSED');
  end if;
  if v_shift.employee_id <> private.uid() and not private.is_admin() then
    perform private.fail('Apenas o responsável ou a gerência pode fechar este turno', 'FORBIDDEN'); end if;

  p_cash_sales := coalesce(p_cash_sales, 0); p_pix := coalesce(p_pix, 0); p_debit := coalesce(p_debit, 0);
  p_credit := coalesce(p_credit, 0); p_transfer := coalesce(p_transfer, 0); p_expense_cents := coalesce(p_expense_cents, 0);
  if least(p_cash_sales, p_pix, p_debit, p_credit, p_transfer, p_expense_cents) < 0
     or greatest(p_cash_sales, p_pix, p_debit, p_credit, p_transfer, p_expense_cents) > 100000000000 then
    perform private.fail('Valor inválido', 'INVALID'); end if;
  if p_counted_cents is null or p_counted_cents < 0 or p_counted_cents > 100000000000 then
    perform private.fail('Dinheiro contado inválido', 'INVALID'); end if;
  if p_expense_cents > 0 and length(trim(coalesce(p_expense_note, ''))) < 3 then
    perform private.fail('Descreva a despesa paga em dinheiro', 'DESCRIPTION_REQUIRED'); end if;

  select change_fund_cents into v_fund from public.organizations where id = v_org;

  -- 1) vendas do turno, uma por forma de pagamento
  for m in select * from (values ('dinheiro', p_cash_sales), ('pix', p_pix), ('debito', p_debit),
                                 ('credito', p_credit), ('transferencia', p_transfer)) t(method, cents) where cents > 0 loop
    perform private.insert_movement(v_org, v_shift, 'sale', m.method, m.cents, 'Total do turno (fechamento)',
      null, null, null, gen_random_uuid(), false);
  end loop;

  -- 2) despesa paga em dinheiro
  if p_expense_cents > 0 then
    select id into v_cat from public.expense_categories
      where organization_id = v_org and kind = 'expense' and active
      order by (lower(name) = 'outras despesas') desc, name limit 1;
    if v_cat is null then perform private.fail('Cadastre uma categoria de despesa em Configurações', 'CATEGORY_REQUIRED'); end if;
    perform private.insert_movement(v_org, v_shift, 'expense', 'dinheiro', p_expense_cents, trim(p_expense_note),
      v_cat, null, null, gen_random_uuid(), false);
  end if;

  -- 3) retirada: tudo que passar do troco vai para o cofre; o troco fica na gaveta
  v_withdraw := greatest(p_counted_cents - v_fund, 0);
  if v_withdraw > 0 then
    select id into v_safe from public.accounts where organization_id = v_org and type = 'safe' and active order by created_at limit 1;
    perform private.insert_movement(v_org, v_shift, 'withdrawal', 'dinheiro', v_withdraw,
      'Retirada do fechamento (fica o troco na gaveta)', null, v_safe, null, gen_random_uuid(), false);
  end if;

  -- 4) fechamento: esperado × o que realmente ficou na gaveta após a retirada
  v_result := public.close_cash_shift(p_shift_id, p_counted_cents - v_withdraw, p_justification, p_request_id);
  return v_result || jsonb_build_object('withdrawn_cents', v_withdraw, 'change_fund_cents', v_fund,
    'counted_before_withdrawal_cents', p_counted_cents);
end $$;

-- Permissões: somente usuários autenticados (e nunca anon).
revoke all on function public.set_change_fund(bigint) from public, anon, authenticated;
grant execute on function public.set_change_fund(bigint) to authenticated;
revoke all on function public.close_shift_simple(uuid, bigint, bigint, bigint, bigint, bigint, bigint, text, bigint, text, uuid)
  from public, anon, authenticated;
grant execute on function public.close_shift_simple(uuid, bigint, bigint, bigint, bigint, bigint, bigint, text, bigint, text, uuid)
  to authenticated;
