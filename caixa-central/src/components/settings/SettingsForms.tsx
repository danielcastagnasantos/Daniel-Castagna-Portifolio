"use client";

import { Pencil, Plus } from "lucide-react";
import { ActionForm, Checkbox, Field, Input, MoneyInput, Select } from "@/components/forms/ActionForm";
import { ModalButton } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/primitives";
import { createRegisterAction, setChangeFundAction, setEmailNotificationsAction, setRegisterActiveAction, setRouteAction, updateSettingsAction, upsertCategoryAction } from "@/app/actions/settings";

export function SettingsForms({ org }: { org: { name: string; blind: boolean; review: string; diff: string; hours: number } }) {
  return (
    <ActionForm action={updateSettingsAction} submit="Salvar configurações" resetOnSuccess={false}>
      <Field label="Nome da empresa" name="name"><Input name="name" required minLength={2} maxLength={120} defaultValue={org.name} /></Field>
      <Checkbox name="blind_close" defaultChecked={org.blind} label="Fechamento cego: o operador só vê o valor esperado depois de informar o dinheiro contado." />
      <Field label="Conferência obrigatória a partir de" name="review_threshold" hint="Sangria, suprimento ou despesa de operador neste valor ou mais fica aguardando aprovação da gerência."><MoneyInput name="review_threshold" defaultValue={org.review} /></Field>
      <Field label="Alertar diferença de caixa acima de" name="diff_alert" hint="Em módulo. 0,00 alerta qualquer diferença."><MoneyInput name="diff_alert" defaultValue={org.diff} /></Field>
      <Field label="Alertar caixa aberto há mais de (horas)" name="shift_max_hours"><Input name="shift_max_hours" type="number" min={1} max={72} required defaultValue={org.hours} /></Field>
    </ActionForm>
  );
}

export function NewRegister() {
  return (
    <ModalButton variant="secondary" size="sm" label="Novo caixa" icon={<Plus size={14} aria-hidden />} title="Novo caixa (gaveta)" description="Cada caixa tem sua própria gaveta e conta em espécie.">
      <ActionForm action={createRegisterAction} submit="Criar caixa"><Field label="Nome" name="name"><Input name="name" required minLength={2} maxLength={80} placeholder="Ex.: Caixa 2" /></Field></ActionForm>
    </ModalButton>
  );
}

export function RegisterRow({ id, name, active }: { id: string; name: string; active: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
      <span className="flex items-center gap-2 font-medium">{name}{!active && <Badge>Inativo</Badge>}</span>
      <ActionForm action={setRegisterActiveAction} submit={active ? "Desativar" : "Reativar"} variant="ghost" submitClassName="h-8 px-3 text-xs">
        <input type="hidden" name="id" value={id} /><input type="hidden" name="active" value={String(!active)} />
      </ActionForm>
    </li>
  );
}

export function RouteRow({ method, label, current, accounts }: { method: string; label: string; current: string; accounts: Array<{ id: string; name: string }> }) {
  return (
    <li className="px-4 py-3 sm:px-5">
      <ActionForm action={setRouteAction} submit="Salvar" variant="secondary" submitClassName="h-9" className="flex flex-wrap items-end gap-3 space-y-0" resetOnSuccess={false}>
        <input type="hidden" name="method" value={method} />
        <Field label={label} name="account_id" className="min-w-52 flex-1"><Select name="account_id" defaultValue={current} required><option value="" disabled>Escolha a conta...</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
      </ActionForm>
    </li>
  );
}

export function NewCategory() {
  return (
    <ModalButton variant="secondary" size="sm" label="Nova categoria" icon={<Plus size={14} aria-hidden />} title="Nova categoria">
      <ActionForm action={upsertCategoryAction} submit="Criar">
        <Field label="Nome" name="name"><Input name="name" required minLength={2} maxLength={60} /></Field>
        <Field label="Tipo" name="kind"><Select name="kind" defaultValue="expense"><option value="expense">Despesa</option><option value="income">Receita</option></Select></Field>
      </ActionForm>
    </ModalButton>
  );
}

export function CategoryRow({ id, name, kind, active }: { id: string; name: string; kind: string; active: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
      <span className="flex items-center gap-2">{name}<Badge tone={kind === "income" ? "success" : "neutral"}>{kind === "income" ? "receita" : "despesa"}</Badge>{!active && <Badge tone="danger">inativa</Badge>}</span>
      <ModalButton variant="ghost" size="sm" label="Editar" icon={<Pencil size={14} aria-hidden />} title="Editar categoria">
        <ActionForm action={upsertCategoryAction} submit="Salvar" resetOnSuccess={false}>
          <input type="hidden" name="id" value={id} /><input type="hidden" name="kind" value={kind} />
          <Field label="Nome" name="name"><Input name="name" required minLength={2} maxLength={60} defaultValue={name} /></Field>
          <Field label="Situação" name="active"><Select name="active" defaultValue={String(active)}><option value="true">Ativa</option><option value="false">Inativa (some das listas)</option></Select></Field>
        </ActionForm>
      </ModalButton>
    </li>
  );
}

export function EmailToggle({ enabled }: { enabled: boolean }) {
  return (
    <ActionForm action={setEmailNotificationsAction} submit={enabled ? "Desativar e-mails" : "Ativar e-mails"} variant="secondary" resetOnSuccess={false}>
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <p className="text-sm">Alertas por e-mail: <b>{enabled ? "ativados" : "desativados"}</b></p>
    </ActionForm>
  );
}

export function ChangeFundForm({ amount }: { amount: string }) {
  return (
    <ActionForm action={setChangeFundAction} submit="Salvar troco" resetOnSuccess={false}>
      <Field label="Troco que fica na gaveta entre os turnos" name="amount" hint="Normalmente R$ 150,00. O fechamento calcula o quanto retirar para sobrar só esse valor.">
        <MoneyInput name="amount" defaultValue={amount} />
      </Field>
    </ActionForm>
  );
}
