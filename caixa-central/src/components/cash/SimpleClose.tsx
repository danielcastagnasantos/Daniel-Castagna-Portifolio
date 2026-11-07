"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { ActionForm, Field, Input, MoneyInput, Textarea } from "@/components/forms/ActionForm";
import { Alert } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { closeSimpleAction } from "@/app/actions/cash";
import { formatBRL, parseMoneyToCents } from "@/lib/money";

/**
 * Fechamento do turno em UMA tela: totais vendidos, dinheiro contado e pronto.
 * O sistema calcula quanto retirar para deixar o troco fixo na gaveta.
 */
export function SimpleCloseForm({ shiftId, openingCents, changeFundCents, blind }: {
  shiftId: string; openingCents: number; changeFundCents: number; blind: boolean;
}) {
  const [v, setV] = useState({ cash: "", expense: "", counted: "" });
  const cash = parseMoneyToCents(v.cash) ?? 0;
  const expense = parseMoneyToCents(v.expense) ?? 0;
  const counted = parseMoneyToCents(v.counted);
  const expected = openingCents + cash - expense;
  const diff = counted === null ? null : counted - expected;
  const withdraw = counted === null ? null : Math.max(counted - changeFundCents, 0);
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));

  return (
    <ActionForm action={closeSimpleAction} submit={<><Lock size={16} aria-hidden /> Fechar turno</>} pendingLabel="Fechando..." resetOnSuccess={false}
      submitClassName="h-12 w-full text-base">
      <input type="hidden" name="shift_id" value={shiftId} />

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">1. Quanto foi vendido neste turno</legend>
        <p className="text-xs text-muted">Some as vendas de cada forma de pagamento (pode deixar em branco o que não teve).</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dinheiro" name="cash_sales"><MoneyInput name="cash_sales" required={false} onChange={set("cash")} /></Field>
          <Field label="Pix" name="pix"><MoneyInput name="pix" required={false} /></Field>
          <Field label="Cartão de débito" name="debit"><MoneyInput name="debit" required={false} /></Field>
          <Field label="Cartão de crédito" name="credit"><MoneyInput name="credit" required={false} /></Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">2. Despesa paga com dinheiro da gaveta (se houve)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor" name="expense"><MoneyInput name="expense" required={false} onChange={set("expense")} /></Field>
          <Field label="O que foi" name="expense_note"><Input name="expense_note" maxLength={250} placeholder="Ex.: gelo" /></Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">3. Conte o dinheiro que está na gaveta</legend>
        <Field label="Total contado (notas e moedas)" name="counted"
          hint={`Conte tudo: o troco de ${formatBRL(changeFundCents)} mais o dinheiro das vendas.`}>
          <MoneyInput name="counted" onChange={set("counted")} />
        </Field>
      </fieldset>

      {counted !== null && (
        <div className="space-y-2 rounded-2xl border border-border bg-surface-2/60 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>Retirar da gaveta</span>
            <b className="tabular text-lg">{formatBRL(withdraw)}</b>
          </div>
          <div className="flex items-center justify-between gap-3 text-muted">
            <span>Deixar de troco</span><b className="tabular">{formatBRL(Math.min(counted, changeFundCents))}</b>
          </div>
          {!blind && diff !== null && (
            <div className={cn("mt-1 flex items-center justify-between gap-3 rounded-xl px-3 py-2 font-medium", diff === 0 ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
              <span>{diff === 0 ? "Caixa bateu" : diff > 0 ? "Sobra" : "Falta"}</span>
              <b className="tabular">{formatBRL(diff, { signed: true })}</b>
            </div>
          )}
        </div>
      )}
      {blind && <Alert tone="info">Fechamento cego: o resultado aparece depois de confirmar.</Alert>}

      <Field label={!blind && diff === 0 ? "Observação (opcional)" : "Justificativa (obrigatória se houver diferença)"} name="justification">
        <Textarea name="justification" rows={2} maxLength={500} required={!blind && diff !== null && diff !== 0} placeholder="Ex.: troco devolvido a mais para um cliente" />
      </Field>
    </ActionForm>
  );
}
