"use client";

import { ArrowLeftRight, Ban, CreditCard, Landmark, Plus, Scale, Undo2 } from "lucide-react";
import { ActionForm, Field, Input, MoneyInput, Select, Textarea } from "@/components/forms/ActionForm";
import { ModalButton } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/primitives";
import { accountTypeLabel } from "@/lib/labels";
import { todayISO } from "@/lib/dates";
import {
  adjustmentAction, cancelReceivableAction, cancelTransferAction, createAccountAction, createReceivableAction,
  receiveReceivableAction, transferAction,
} from "@/app/actions/finance";

type Acc = { id: string; name: string; type: string };

export function NewAccountButton() {
  return (
    <ModalButton variant="secondary" label="Nova conta" icon={<Plus size={16} aria-hidden />} title="Nova conta financeira" description="Conta bancária, Pix, cofre ou cartão a receber.">
      <ActionForm action={createAccountAction} submit="Criar conta">
        <Field label="Nome" name="name"><Input name="name" required minLength={2} maxLength={80} placeholder="Ex.: Banco do Brasil" /></Field>
        <Field label="Tipo" name="type"><Select name="type" defaultValue="bank">{(["bank", "pix", "safe", "card_receivable"] as const).map((t) => <option key={t} value={t}>{accountTypeLabel[t]}</option>)}</Select></Field>
        <Field label="Banco (opcional)" name="bank_name"><Input name="bank_name" maxLength={80} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Saldo inicial" name="opening" hint="Saldo que a conta já tinha. Entra como lançamento “Saldo inicial”."><MoneyInput name="opening" required={false} allowNegative defaultValue="0,00" /></Field>
          <Field label="Data do saldo" name="opening_date"><Input name="opening_date" type="date" defaultValue={todayISO()} max={todayISO()} /></Field>
        </div>
        <Alert tone="info">A gaveta do caixa é criada em Configurações &gt; Caixas.</Alert>
      </ActionForm>
    </ModalButton>
  );
}

export function TransferButton({ accounts, settlement = false }: { accounts: Acc[]; settlement?: boolean }) {
  const kind = settlement ? "card_settlement" : "transfer";
  const from = settlement ? accounts.filter((a) => a.type === "card_receivable") : accounts.filter((a) => a.type !== "cash_drawer");
  const to = settlement ? accounts.filter((a) => a.type === "bank" || a.type === "pix") : accounts.filter((a) => a.type !== "cash_drawer");
  return (
    <ModalButton variant="secondary" label={settlement ? "Liquidar cartão" : "Transferir"} icon={settlement ? <CreditCard size={16} aria-hidden /> : <ArrowLeftRight size={16} aria-hidden />}
      title={settlement ? "Liquidação de cartão" : "Transferência entre contas"}
      description={settlement ? "Registre quando o dinheiro das vendas no cartão cair no banco. Não é uma nova receita." : "Mover dinheiro entre contas não é receita nem despesa."}>
      <ActionForm action={transferAction} submit={settlement ? "Registrar liquidação" : "Transferir"}>
        <input type="hidden" name="kind" value={kind} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sai de" name="from"><Select name="from" required defaultValue=""><option value="" disabled>Escolha...</option>{from.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label="Entra em" name="to"><Select name="to" required defaultValue=""><option value="" disabled>Escolha...</option>{to.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label={settlement ? "Valor bruto liquidado" : "Valor"} name="amount"><MoneyInput name="amount" /></Field>
          <Field label="Data" name="occurred_on"><Input name="occurred_on" type="date" required defaultValue={todayISO()} max={todayISO()} /></Field>
        </div>
        {settlement && kind === "card_settlement" && <Field label="Taxa cobrada pela operadora" name="fee" hint="Descontada do valor recebido e lançada como despesa “Taxas de cartão”."><MoneyInput name="fee" required={false} defaultValue="0,00" /></Field>}
        <Field label="Observação" name="note"><Input name="note" maxLength={250} placeholder={settlement ? "Ex.: Cielo — vendas de 03/03" : "Ex.: depósito do cofre"} /></Field>
        {!settlement && <Alert tone="info">A gaveta do caixa não aparece aqui: use sangria/suprimento dentro do turno para mexer no dinheiro físico.</Alert>}
      </ActionForm>
    </ModalButton>
  );
}

export function AdjustmentButton({ accounts }: { accounts: Acc[] }) {
  return (
    <ModalButton variant="ghost" label="Ajuste manual" icon={<Scale size={16} aria-hidden />} title="Ajuste manual de saldo" description="Para corrigir diferenças. Fica no histórico com o motivo e o seu nome.">
      <ActionForm action={adjustmentAction} submit="Lançar ajuste">
        <Field label="Conta" name="account_id"><Select name="account_id" required defaultValue=""><option value="" disabled>Escolha...</option>{accounts.filter((a) => a.type !== "cash_drawer").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label="Valor do ajuste" name="amount" hint="Use negativo para diminuir o saldo. Ex.: -15,00"><MoneyInput name="amount" allowNegative /></Field>
        <Field label="Motivo (mínimo 10 caracteres)" name="reason"><Textarea name="reason" required minLength={10} maxLength={300} /></Field>
      </ActionForm>
    </ModalButton>
  );
}

export function CancelTransferButton({ id }: { id: string }) {
  return (
    <ModalButton variant="danger-ghost" size="sm" label="Cancelar" icon={<Undo2 size={14} aria-hidden />} title="Cancelar transferência" description="Os saldos voltam por um estorno registrado.">
      <ActionForm action={cancelTransferAction} submit="Cancelar transferência" variant="danger">
        <input type="hidden" name="id" value={id} />
        <Field label="Motivo" name="reason"><Input name="reason" required minLength={5} maxLength={300} /></Field>
      </ActionForm>
    </ModalButton>
  );
}

export function NewReceivableButton() {
  return (
    <ModalButton variant="primary" label="Nova conta a receber" icon={<Plus size={16} aria-hidden />} title="Conta a receber" description="Valor que um cliente ainda vai pagar (ex.: venda a prazo).">
      <ActionForm action={createReceivableAction} submit="Cadastrar">
        <Field label="Cliente" name="customer"><Input name="customer" required minLength={2} maxLength={140} /></Field>
        <Field label="Descrição" name="description"><Input name="description" maxLength={250} placeholder="Ex.: pedido 118 — 20 caixas" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor" name="amount"><MoneyInput name="amount" /></Field>
          <Field label="Vencimento" name="due_date"><Input name="due_date" type="date" required defaultValue={todayISO()} /></Field>
        </div>
      </ActionForm>
    </ModalButton>
  );
}

export function ReceiveButton({ id, accounts }: { id: string; accounts: Acc[] }) {
  return (
    <ModalButton variant="secondary" size="sm" label="Receber" icon={<Landmark size={14} aria-hidden />} title="Registrar recebimento" description="O valor entra na conta escolhida e conta como faturamento do dia do recebimento.">
      <ActionForm action={receiveReceivableAction} submit="Confirmar recebimento">
        <input type="hidden" name="id" value={id} />
        <Field label="Entrou em qual conta?" name="account_id"><Select name="account_id" required defaultValue=""><option value="" disabled>Escolha...</option>{accounts.filter((a) => ["bank", "pix", "safe"].includes(a.type)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label="Data do recebimento" name="received_on"><Input name="received_on" type="date" required defaultValue={todayISO()} max={todayISO()} /></Field>
        <Alert tone="info">Recebimento em dinheiro vivo: registre como “Outra entrada” dentro do turno do caixa.</Alert>
      </ActionForm>
    </ModalButton>
  );
}

export function CancelReceivableButton({ id }: { id: string }) {
  return (
    <ModalButton variant="danger-ghost" size="sm" label="Cancelar" icon={<Ban size={14} aria-hidden />} title="Cancelar conta a receber">
      <ActionForm action={cancelReceivableAction} submit="Cancelar" variant="danger">
        <input type="hidden" name="id" value={id} />
        <Field label="Motivo" name="reason"><Input name="reason" required minLength={5} maxLength={300} /></Field>
      </ActionForm>
    </ModalButton>
  );
}
