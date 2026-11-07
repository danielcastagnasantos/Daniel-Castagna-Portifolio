import Link from "next/link";
import { Banknote, Bell, CreditCard, Landmark, Settings2, Store, Tags, Wrench } from "lucide-react";
import { getOrganization, requireAuth } from "@/lib/auth";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { ChangeFundForm, SettingsForms, CategoryRow, RegisterRow, RouteRow, NewCategory, NewRegister, EmailToggle } from "@/components/settings/SettingsForms";
import { accountTypeLabel, methodLabel } from "@/lib/labels";
import { centsToInput } from "@/lib/money";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ctx = await requireAuth("configuracoes");
  const org = await getOrganization();
  const [regs, accs, routes, cats] = await Promise.all([
    ctx.supabase.from("registers").select("id, name, active, account_id").order("name"),
    ctx.supabase.from("accounts").select("id, name, type").eq("active", true).order("name"),
    ctx.supabase.from("payment_routes").select("payment_method, account_id"),
    ctx.supabase.from("expense_categories").select("id, name, kind, active").order("kind").order("name"),
  ]);
  const accounts = (accs.data ?? []) as Array<{ id: string; name: string; type: string }>;
  const routeOf = Object.fromEntries((routes.data ?? []).map((r: { payment_method: string; account_id: string }) => [r.payment_method, r.account_id]));
  if (!org) return null;
  return (
    <>
      <PageHeader title="Configurações" description="Regras do caixa, caixas (gavetas), destino de cada forma de pagamento e categorias." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="self-start">
          <CardHeader icon={Banknote} title="Troco do caixa" />
          <CardBody><ChangeFundForm amount={centsToInput(org.change_fund_cents)} /></CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader icon={Wrench} title="Recursos avançados" description="Telas que ficam fora do menu para manter o dia a dia simples." />
          <CardBody className="grid grid-cols-2 gap-2 text-sm">
            {[["/contas", "Contas e saldos"], ["/conciliacao", "Conciliação do banco"], ["/receber", "Contas a receber"], ["/relatorios", "Todos os relatórios"], ["/notificacoes", "Notificações"], ["/auditoria", "Auditoria"]].map(([href, label]) => (
              <Link key={href} href={href} className="rounded-xl border border-border px-3 py-2 hover:bg-surface-2">{label}</Link>
            ))}
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader icon={Settings2} title="Empresa e regras do caixa" />
          <CardBody><SettingsForms org={{ name: org.name, blind: org.blind_close, review: centsToInput(org.review_threshold_cents), diff: centsToInput(org.diff_alert_cents), hours: org.shift_max_hours }} /></CardBody>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader icon={Store} title="Caixas (gavetas)" action={<NewRegister />} />
            <ul className="divide-y divide-border">{(regs.data ?? []).map((r: { id: string; name: string; active: boolean }) => <RegisterRow key={r.id} id={r.id} name={r.name} active={r.active} />)}</ul>
          </Card>
          <Card>
            <CardHeader icon={Landmark} title="Para onde vai cada forma de pagamento" description="Dinheiro vai sempre para a gaveta do caixa. Pix e cartão não entram no dinheiro esperado." />
            <ul className="divide-y divide-border">
              {(["pix", "debito", "credito", "transferencia"] as const).map((m) => (
                <RouteRow key={m} method={m} label={methodLabel[m]} current={routeOf[m] ?? ""} accounts={accounts.filter((a) => (m === "pix" ? ["pix", "bank"] : m === "transferencia" ? ["bank", "pix"] : ["card_receivable"]).includes(a.type)).map((a) => ({ id: a.id, name: `${a.name} (${accountTypeLabel[a.type]})` }))} />
              ))}
            </ul>
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader icon={Tags} title="Categorias" action={<NewCategory />} />
          <ul className="divide-y divide-border">
            {(cats.data ?? []).map((c: { id: string; name: string; kind: string; active: boolean }) => <CategoryRow key={c.id} id={c.id} name={c.name} kind={c.kind} active={c.active} />)}
          </ul>
        </Card>
        <Card className="self-start">
          <CardHeader icon={Bell} title="Meus alertas por e-mail" />
          <CardBody className="space-y-3">
            <EmailToggle enabled={ctx.profile.email_notifications} />
            <Alert tone="info">O envio depende de configuração no servidor (provedor de e-mail e agendador). Veja “Notificações” no manual do administrador. Sem isso, os alertas aparecem apenas dentro do sistema.</Alert>
            <p className="text-xs text-muted"><CreditCard size={12} className="mr-1 inline" aria-hidden />Perfil atual: <Badge>{ctx.profile.email}</Badge></p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
