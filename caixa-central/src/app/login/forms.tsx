"use client";
import { ActionForm, Field, Input } from "@/components/forms/ActionForm";
import { forgotPasswordAction, loginAction } from "@/app/actions/auth";

export function LoginForm() {
  return (
    <ActionForm action={loginAction} submit="Entrar" pendingLabel="Entrando..." fullWidth resetOnSuccess={false}>
      <Field label="E-mail" name="email"><Input name="email" type="email" autoComplete="username" inputMode="email" required placeholder="voce@empresa.com" autoFocus /></Field>
      <Field label="Senha" name="password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
    </ActionForm>
  );
}
export function ForgotForm() {
  return (
    <ActionForm action={forgotPasswordAction} submit="Enviar link" fullWidth>
      <Field label="E-mail" name="email"><Input name="email" type="email" required autoComplete="email" /></Field>
    </ActionForm>
  );
}
