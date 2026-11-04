"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Banknote, CircleMinus, HandCoins, Lock, ReceiptText, Undo2, Wallet } from "lucide-react";
import { ActionForm, Checkbox, Field, Input, MoneyInput, Select, Textarea } from "@/components/forms/ActionForm";
import { Modal } from "@/components/ui/Modal";
import { Button, Alert } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { closeShiftAction, movementAction, openShiftAction } from "@/app/actions/cash";
import { formatBRL, parseMoneyToCents } from "@/lib/money";
import { PAYMENT_METHODS, methodLabel } from "@/lib/labels";

export function OpenShiftForm({ registers }: { registers: Array<{ id: string; name: string }> }) {
  return (
    <ActionForm action={openShiftAction} submit={<><Wallet size={16} aria-hidden /> Abrir meu turno</>} pendingLabel="Abrindo..." submitClassName="w-full sm:w-auto">
      {registers.length > 1 ? (
        <Field label="Caixa" name="register_id"><Select name="register_id" required>{registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
      ) : <input type="hidden" name="register_id" value={registers[0]?.id ?? ""} />}
      <Field label="Dinheiro contado na gaveta agora" name="opening" hint="Conte as notas e moedas antes de digitar. O sistema compara com o que o turno anterior deixou.">
        <MoneyInput name="opening" autoFocus />
      </Field>
      <Field label="Observação da passagem de turno" name="note" hint="Obrigatória apenas se a sua contagem não bater com a do turno anterior.">
        <Textarea name="note" rows={2} maxLength={500} placeholder="Ex.: faltou uma nota de R$ 10 ao contar" />
      </Field>
    </ActionForm>
  );
}

type Kind = "sale" | "withdrawal" | "supply" | "expense" | "other_in" | "refund";
const KINDS: Array<{ kind: Kind; label: string; icon: typeof Banknote; adminOnly?: boolean; hint: string }> = [
  { kind: "sale", label: "Venda", icon: Banknote, hint: "Registre o valor recebido e a forma de pagamento." },
  { kind: "withdrawal", label: "Sangria", icon: ArrowUpFromLine, hint: "Retirada de dinheiro da gaveta (ex.: levar ao cofre ou depositar)." },
  { kind: "supply", label: "Suprimento", icon: ArrowDownToLine, hint: "Dinheiro colocado na gaveta (ex.: troco)." },
  { kind: "expense", label: "Despesa", icon: CircleMinus, hint: "Despesa paga em dinheiro da gaveta (ex.: gelo, lanche)." },
  { kind: "other_in", label: "Outra entrada", icon: HandCoins, adminOnly: true, hint: "Entrada que não é venda." },
  { kind: "refund", label: "Estorno", icon: Undo2, adminOnly: true, hint: "Devolução de venda ao cliente." },
];

export function MovementForm({ shiftId, isAdmin, categories, counterAccounts, closedShifts = [] }: {
  shiftId: string; isAdmin: boolean; categories: Array<{ id: string; name: string }>;
  counterAccounts: Array<{ id: string; name: string }>; closedShifts?: Array<{ id: string; label: string }>;
}) {
  const [kind, setKind] = useState<Kind>("sale");
  const [method, setMethod] = useState("dinheiro");
  const current = KINDS.find((k) => k.kind === kind)!;
  const usesMethod = kind === "sale" || kind === "other_in" || kind === "refund";
  return (
    <ActionForm action={movementAction} submit={<><ReceiptText size={16} aria-hidden /> Registrar {current.label.toLowerCase()}</>} pendingLabel="Registrando..." submitClassName="w-full h-12 text-base sm:w-auto"
      onSuccess={() => setMethod("dinheiro")}>
      <input type="hidden" name="shift_id" value={shiftId} />
      <input type="hidden" name="kind" value={kind} />
      <div role="tablist" aria-label="Tipo de lançamento" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {KINDS.filter((k) => isAdmin || !k.adminOnly).map((k) => (
          <button key={k.kind} type="button" role="tab" aria-selected={kind === k.kind} onClick={() => setKind(k.kind)}
            className={cn("flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition",
              kind === k.kind ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-surface-2")}>
            <k.icon size={16} aria-hidden />{k.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{current.hint}</p>

      <Field label="Valor" name="amount"><MoneyInput name="amount" /></Field>

      {usesMethod && (
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium">Forma de pagamento</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PAYMENT_METHODS.map((m) => (
              <label key={m} className={cn("cursor-pointer rounded-xl border px-3 py-2 text-center text-sm font-medium transition has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary", "border-border hover:bg-surface-2")}>
                <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
                {methodLabel[m]}
              </label>
            ))}
          </div>
          {method !== "dinheiro" && <p className="mt-1.5 text-xs text-muted">Pix e cartão não entram na gaveta: não alteram o dinheiro esperado.</p>}
        </fieldset>
      )}

      {kind === "expense" && (
        <Field label="Categoria da despesa" name="category_id">
          <Select name="category_id" required defaultValue=""><option value="" disabled>Escolha...</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
      )}
      {(kind === "withdrawal" || kind === "supply") && (
        <Field label={kind === "withdrawal" ? "Para onde foi o dinheiro?" : "De onde veio o dinheiro?"} name="counter_account_id">
          <Select name="counter_account_id" defaultValue="">
            <option value="">{kind === "withdrawal" ? "Retirada do proprietário (fora do sistema)" : "Aporte (fora do sistema)"}</option>
            {counterAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label={kind === "sale" ? "Observação (opcional)" : "Descrição"} name="description">
        <Input name="description" maxLength={250} required={kind !== "sale"} placeholder={kind === "sale" ? "Ex.: venda balcão" : "Explique o motivo"} />
      </Field>
      {isAdmin && closedShifts.length > 0 && (
        <Field label="Corrige um turno já fechado? (opcional)" name="corrects_shift_id" hint="Turnos fechados não são alterados: registre aqui a correção e indique a qual turno ela se refere.">
          <Select name="corrects_shift_id" defaultValue=""><option value="">Não</option>{closedShifts.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
        </Field>
      )}
    </ActionForm>
  );
}

/** Fechamento: botão -> modal de confirmação com a contagem física. */
export function CloseShiftButton({ shiftId, expectedCents, blind }: { shiftId: string; expectedCents: number | null; blind: boolean }) {
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState("");
  const cents = parseMoneyToCents(counted);
  const diff = !blind && expectedCents !== null && cents !== null ? cents - expectedCents : null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className="w-full sm:w-auto"><Lock size={16} aria-hidden /> Fechar turno</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Fechar turno" description="Conte todo o dinheiro da gaveta e informe o total.">
        <ActionForm action={closeShiftAction} submit="Confirmar fechamento" pendingLabel="Fechando..." variant="primary" resetOnSuccess={false}>
          <input type="hidden" name="shift_id" value={shiftId} />
          {blind ? (
            <Alert tone="info">Fechamento cego: o valor esperado só aparece depois que você confirmar a contagem.</Alert>
          ) : expectedCents !== null && (
            <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
              <div className="flex justify-between"><span className="text-muted">Dinheiro esperado na gaveta</span><b className="tabular">{formatBRL(expectedCents)}</b></div>
            </div>
          )}
          <Field label="Dinheiro contado na gaveta" name="counted"><MoneyInput name="counted" autoFocus onChange={setCounted} /></Field>
          {diff !== null && (
            <div className={cn("flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium", diff === 0 ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
              <span>{diff === 0 ? "Caixa bateu" : diff > 0 ? "Sobra" : "Falta"}</span><b className="tabular">{formatBRL(diff, { signed: true })}</b>
            </div>
          )}
          <Field label={diff === 0 ? "Observação (opcional)" : "Justificativa da diferença"} name="justification" hint={blind ? "Se houver diferença, a justificativa é obrigatória." : undefined}>
            <Textarea name="justification" rows={2} maxLength={500} required={diff !== null && diff !== 0} placeholder="Ex.: troco devolvido a mais para um cliente" />
          </Field>
          <Checkbox name="confirm" required label="Contei o dinheiro e quero encerrar este turno. Depois de fechado, ele não poderá ser alterado." />
        </ActionForm>
      </Modal>
    </>
  );
}
