"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Ban, HandCoins, Undo2, Building2 } from "lucide-react";
import { ActionForm, Checkbox, Field, Input, MoneyInput, Select, Textarea } from "@/components/forms/ActionForm";
import { ModalButton } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { cancelBillAction, cancelPaymentAction, createBillsAction, payBillAction, updateBillAction, upsertSupplierAction } from "@/app/actions/bills";
import { uploadBillFile, validateFile } from "./FileUpload";
import { centsToInput } from "@/lib/money";
import { payMethodLabel } from "@/lib/labels";
import { todayISO } from "@/lib/dates";

type Opt = { id: string; name: string };

export function NewBillButton({ orgId, suppliers, categories }: { orgId: string; suppliers: Opt[]; categories: Opt[] }) {
  const [mode, setMode] = useState("single");
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <ModalButton variant="primary" label="Novo boleto" icon={<Plus size={16} aria-hidden />} title="Cadastrar boleto" description="Único, parcelado ou recorrente.">
      {suppliers.length === 0 ? (
        <Alert tone="warning" title="Cadastre um fornecedor primeiro">Vá em Boletos &gt; Fornecedores e cadastre quem emitiu o boleto.</Alert>
      ) : (
        <ActionForm action={createBillsAction} submit="Cadastrar" onSuccess={async (s) => {
          const file = fileRef.current?.files?.[0];
          const ids = (s.data?.ids as string[] | undefined) ?? [];
          if (file && ids[0]) {
            try { await uploadBillFile({ orgId, billId: ids[0], kind: "boleto", file }); toast.success("Boleto anexado."); }
            catch (e) { toast.error(`O boleto foi cadastrado, mas o anexo falhou: ${e instanceof Error ? e.message : "erro"}. Anexe pela tela do boleto.`); }
          }
        }}>
          <Field label="Fornecedor" name="supplier_id"><Select name="supplier_id" required defaultValue=""><option value="" disabled>Escolha...</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Descrição" name="description"><Input name="description" required minLength={2} maxLength={200} placeholder="Ex.: Pedido 4521 — cerveja" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoria" name="category_id"><Select name="category_id" defaultValue=""><option value="">Sem categoria</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label={mode === "installments" ? "Valor total" : "Valor"} name="amount"><MoneyInput name="amount" /></Field>
            <Field label={mode === "single" ? "Vencimento" : "Primeiro vencimento"} name="first_due"><Input name="first_due" type="date" required defaultValue={todayISO()} /></Field>
            <Field label="Tipo" name="mode">
              <Select name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="single">Único</option><option value="installments">Parcelado (divide o total)</option><option value="recurring">Recorrente (repete o valor)</option>
              </Select>
            </Field>
          </div>
          {mode !== "single" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={mode === "installments" ? "Nº de parcelas" : "Nº de ocorrências"} name="count" hint="De 2 a 60."><Input name="count" type="number" min={2} max={60} defaultValue={mode === "installments" ? 3 : 12} required /></Field>
              <Field label="Periodicidade" name="interval"><Select name="interval" defaultValue="month"><option value="month">Mensal</option><option value="week">Semanal</option></Select></Field>
            </div>
          )}
          {mode === "single" && <Field label="Linha digitável (opcional)" name="barcode" hint="47 ou 48 dígitos. Evita lançar o mesmo boleto duas vezes."><Input name="barcode" inputMode="numeric" maxLength={80} placeholder="00000.00000 00000.000000 ..." /></Field>}
          <Field label="Observações" name="notes"><Textarea name="notes" rows={2} maxLength={500} /></Field>
          {mode === "single" && (
            <div className="space-y-1.5">
              <label htmlFor="new-bill-file" className="block text-[13px] font-medium">Anexar o boleto (PDF ou imagem, até 10 MB)</label>
              <input id="new-bill-file" ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm"
                onChange={(e) => { const f = e.target.files?.[0]; const err = f ? validateFile(f) : null; if (err) { toast.error(err); e.target.value = ""; } }} />
            </div>
          )}
        </ActionForm>
      )}
    </ModalButton>
  );
}

export function PayBillButton({ billId, remainingCents, accounts }: { billId: string; remainingCents: number; accounts: Opt[] }) {
  return (
    <ModalButton variant="primary" label="Registrar pagamento" icon={<HandCoins size={16} aria-hidden />} title="Registrar pagamento"
      description="Registre somente depois de conferir no app ou extrato do banco que o pagamento foi realizado.">
      <ActionForm action={payBillAction} submit="Confirmar pagamento" pendingLabel="Registrando...">
        <input type="hidden" name="bill_id" value={billId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor pago" name="amount" hint="Pode ser parcial."><MoneyInput name="amount" defaultValue={centsToInput(remainingCents)} /></Field>
          <Field label="Data do pagamento" name="paid_on"><Input name="paid_on" type="date" required defaultValue={todayISO()} max={todayISO()} /></Field>
          <Field label="Saiu de qual conta?" name="account_id"><Select name="account_id" required defaultValue=""><option value="" disabled>Escolha...</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label="Forma" name="method"><Select name="method" defaultValue="pix">{Object.entries(payMethodLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        <Field label="Observação" name="note"><Input name="note" maxLength={250} /></Field>
        <Alert tone="info">Pagamento em dinheiro pela gaveta exige turno aberto e entra no dinheiro esperado — sem duplicar a saída.</Alert>
        <Checkbox name="confirmed" required label="Conferi no banco: o pagamento foi efetivamente realizado." />
      </ActionForm>
    </ModalButton>
  );
}

export function EditBillButton({ bill, suppliers, categories }: {
  bill: { id: string; supplier_id: string; description: string; category_id: string | null; amount_cents: number; due_date: string; barcode: string | null; notes: string | null };
  suppliers: Opt[]; categories: Opt[];
}) {
  return (
    <ModalButton variant="secondary" label="Editar" icon={<Pencil size={16} aria-hidden />} title="Editar boleto" description="A alteração fica registrada no histórico.">
      <ActionForm action={updateBillAction} submit="Salvar alterações" resetOnSuccess={false}>
        <input type="hidden" name="id" value={bill.id} />
        <Field label="Fornecedor" name="supplier_id"><Select name="supplier_id" defaultValue={bill.supplier_id}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Descrição" name="description"><Input name="description" required defaultValue={bill.description} maxLength={200} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoria" name="category_id"><Select name="category_id" defaultValue={bill.category_id ?? ""}><option value="">Sem categoria</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Valor" name="amount"><MoneyInput name="amount" defaultValue={centsToInput(bill.amount_cents)} /></Field>
          <Field label="Vencimento" name="due_date"><Input name="due_date" type="date" required defaultValue={bill.due_date} /></Field>
          <Field label="Linha digitável" name="barcode"><Input name="barcode" defaultValue={bill.barcode ?? ""} inputMode="numeric" /></Field>
        </div>
        <Field label="Observações" name="notes"><Textarea name="notes" rows={2} defaultValue={bill.notes ?? ""} maxLength={500} /></Field>
      </ActionForm>
    </ModalButton>
  );
}

export function CancelBillButton({ id }: { id: string }) {
  return (
    <ModalButton variant="danger-ghost" label="Cancelar boleto" icon={<Ban size={16} aria-hidden />} title="Cancelar boleto"
      description="O boleto não é apagado: fica marcado como cancelado com o motivo.">
      <ActionForm action={cancelBillAction} submit="Cancelar boleto" variant="danger">
        <input type="hidden" name="id" value={id} />
        <Field label="Motivo (obrigatório)" name="reason"><Input name="reason" required minLength={5} maxLength={300} /></Field>
      </ActionForm>
    </ModalButton>
  );
}

export function CancelPaymentButton({ id }: { id: string }) {
  return (
    <ModalButton variant="danger-ghost" size="sm" label="Cancelar" icon={<Undo2 size={14} aria-hidden />} title="Cancelar pagamento"
      description="O valor volta para a conta de origem por um estorno rastreável e o boleto volta a ficar em aberto.">
      <ActionForm action={cancelPaymentAction} submit="Cancelar pagamento" variant="danger">
        <input type="hidden" name="id" value={id} />
        <Field label="Motivo (obrigatório)" name="reason"><Input name="reason" required minLength={5} maxLength={300} /></Field>
      </ActionForm>
    </ModalButton>
  );
}

export function SupplierButton({ supplier, className }: {
  supplier?: { id: string; name: string; document: string | null; phone: string | null; email: string | null; notes: string | null; active: boolean }; className?: string;
}) {
  return (
    <ModalButton variant={supplier ? "ghost" : "primary"} size={supplier ? "sm" : "md"} className={cn(className)}
      label={supplier ? "Editar" : "Novo fornecedor"} icon={supplier ? <Pencil size={14} aria-hidden /> : <Building2 size={16} aria-hidden />}
      title={supplier ? "Editar fornecedor" : "Novo fornecedor"}>
      <ActionForm action={upsertSupplierAction} submit="Salvar" resetOnSuccess={!supplier}>
        {supplier && <input type="hidden" name="id" value={supplier.id} />}
        <Field label="Nome" name="name"><Input name="name" required minLength={2} maxLength={140} defaultValue={supplier?.name} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="CNPJ/CPF" name="document"><Input name="document" maxLength={24} defaultValue={supplier?.document ?? ""} /></Field>
          <Field label="Telefone" name="phone"><Input name="phone" type="tel" maxLength={30} defaultValue={supplier?.phone ?? ""} /></Field>
        </div>
        <Field label="E-mail" name="email"><Input name="email" type="email" maxLength={160} defaultValue={supplier?.email ?? ""} /></Field>
        <Field label="Observações" name="notes"><Textarea name="notes" rows={2} maxLength={500} defaultValue={supplier?.notes ?? ""} /></Field>
        {supplier && (
          <Field label="Situação" name="active"><Select name="active" defaultValue={String(supplier.active)}><option value="true">Ativo</option><option value="false">Inativo (não aparece em novos boletos)</option></Select></Field>
        )}
      </ActionForm>
    </ModalButton>
  );
}
