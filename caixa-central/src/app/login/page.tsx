import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/shell/AuthShell";
import { Alert } from "@/components/ui/primitives";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LoginForm, ForgotForm } from "./forms";

export const metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "sem-acesso": "Seu usuário não tem acesso ativo. Fale com o administrador.",
  "link-invalido": "Link inválido ou expirado. Peça um novo ao administrador ou use “Esqueci minha senha”.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; esqueci?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (session?.profile) redirect("/");

  let needsSetup = false;
  try {
    const { data } = await createAdminClient().rpc("svc_setup_status");
    needsSetup = !!(data as { needs_setup?: boolean } | null)?.needs_setup;
  } catch { /* sem chave de serviço no ambiente: ignora */ }

  if (sp.esqueci) {
    return (
      <AuthShell title="Recuperar senha" subtitle="Enviaremos um link para criar uma nova senha.">
        <ForgotForm />
        <p className="mt-5 text-center text-sm"><Link href="/login" className="text-primary hover:underline">Voltar ao login</Link></p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Entrar" subtitle="Use seu e-mail e a sua senha pessoal.">
      <div className="space-y-4">
        {sp.erro && ERRORS[sp.erro] && <Alert tone="danger">{ERRORS[sp.erro]}</Alert>}
        {needsSetup && (
          <Alert tone="info" title="Primeiro acesso">
            Nenhuma empresa cadastrada ainda. <Link href="/setup" className="font-semibold underline">Fazer o cadastro inicial</Link>.
          </Alert>
        )}
        <LoginForm />
        <p className="text-center text-sm"><Link href="/login?esqueci=1" className="text-muted hover:text-text hover:underline">Esqueci minha senha</Link></p>
        <p className="text-center text-xs text-muted">Não há cadastro público: as contas são criadas pela administração.</p>
      </div>
    </AuthShell>
  );
}
