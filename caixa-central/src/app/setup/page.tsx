import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/shell/AuthShell";
import { Alert } from "@/components/ui/primitives";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { SetupForm } from "./form";

export const metadata = { title: "Cadastro inicial" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  let needsSetup = false;
  let error: string | null = null;
  try {
    const { data, error: e } = await createAdminClient().rpc("svc_setup_status");
    if (e) error = "Não foi possível consultar o banco. Aplique as migrations (supabase/migrations) e confira as variáveis de ambiente.";
    needsSetup = !!(data as { needs_setup?: boolean } | null)?.needs_setup;
  } catch (e) {
    error = e instanceof Error ? e.message : "Configuração do Supabase ausente.";
  }
  if (!error && !needsSetup) redirect("/login");

  const tokenRequired = !!serverEnv.setupToken;
  const missingToken = process.env.NODE_ENV === "production" && !tokenRequired;
  return (
    <AuthShell title="Cadastro inicial" subtitle="Crie a empresa e a conta do proprietário. Isto só pode ser feito uma vez.">
      {error ? <Alert tone="danger" title="Não foi possível continuar">{error}</Alert> : missingToken ? (
        <Alert tone="warning" title="Falta configurar o SETUP_TOKEN">
          Por segurança, em produção o cadastro inicial exige um código definido na variável de ambiente <code>SETUP_TOKEN</code> do servidor. Defina-o, faça um novo deploy e volte aqui.
        </Alert>
      ) : <SetupForm tokenRequired={tokenRequired} />}
      <p className="mt-5 text-center text-sm"><Link href="/login" className="text-primary hover:underline">Voltar ao login</Link></p>
    </AuthShell>
  );
}
