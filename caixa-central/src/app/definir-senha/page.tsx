import { redirect } from "next/navigation";
import { AuthShell } from "@/components/shell/AuthShell";
import { getSession } from "@/lib/auth";
import { ActionForm, Field, Input } from "@/components/forms/ActionForm";
import { newPasswordAction } from "@/app/actions/auth";

export const metadata = { title: "Definir senha" };
export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const forced = s.profile?.must_change_password;
  return (
    <AuthShell title="Defina sua senha" subtitle={forced ? "Esta é a sua primeira entrada. Crie uma senha pessoal — só você deve conhecê-la." : "Escolha uma nova senha pessoal."}>
      <ActionForm action={newPasswordAction} submit="Salvar senha" submitClassName="w-full" resetOnSuccess={false}>
        <Field label="Nova senha" name="password" hint="Mínimo de 10 caracteres."><Input name="password" type="password" required minLength={10} maxLength={72} autoComplete="new-password" autoFocus /></Field>
        <Field label="Repita a nova senha" name="password2"><Input name="password2" type="password" required autoComplete="new-password" /></Field>
      </ActionForm>
    </AuthShell>
  );
}
