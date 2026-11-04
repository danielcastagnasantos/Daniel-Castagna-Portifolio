"use client";
import { ActionForm, Field, Input } from "@/components/forms/ActionForm";
import { setupAction } from "@/app/actions/auth";

export function SetupForm({ tokenRequired }: { tokenRequired: boolean }) {
  return (
    <ActionForm action={setupAction} submit="Criar empresa e entrar" pendingLabel="Criando..." submitClassName="w-full" resetOnSuccess={false}>
      {tokenRequired && <Field label="Código de instalação" name="token" hint="O valor de SETUP_TOKEN configurado no servidor."><Input name="token" type="password" required autoComplete="off" /></Field>}
      <Field label="Nome da distribuidora" name="org_name"><Input name="org_name" required minLength={2} maxLength={120} /></Field>
      <Field label="Seu nome (proprietário)" name="owner_name"><Input name="owner_name" required minLength={2} maxLength={120} autoComplete="name" /></Field>
      <Field label="Seu e-mail" name="email"><Input name="email" type="email" required autoComplete="username" /></Field>
      <Field label="Senha" name="password" hint="Mínimo de 10 caracteres."><Input name="password" type="password" required minLength={10} maxLength={72} autoComplete="new-password" /></Field>
      <Field label="Repita a senha" name="password2"><Input name="password2" type="password" required autoComplete="new-password" /></Field>
    </ActionForm>
  );
}
