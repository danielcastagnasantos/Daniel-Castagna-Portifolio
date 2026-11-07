import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { fixtures } from "./fake-supabase/fixtures.mjs";

const { U } = fixtures.ids;
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** Cookie de sessão no formato do @supabase/ssr (ref = "127" por causa de 127.0.0.1). */
async function login(ctx: BrowserContext, uid: string) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: uid, role: "authenticated", aud: "authenticated", exp })}.sig`;
  const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: exp, user: fixtures.users[uid].auth };
  await ctx.addCookies([{ name: "sb-127-auth-token", value: `base64-${b64url(session)}`, domain: "127.0.0.1", path: "/" }]);
}

const errors = (page: Page) => {
  const list: string[] = [];
  page.on("pageerror", (e) => list.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) list.push(`console: ${m.text()}`); });
  return list;
};

const ADMIN_PAGES = ["/painel", "/painel?periodo=ano", "/painel?periodo=semana", "/boletos?ver=pagos", "/caixa", "/caixa/turnos", `/caixa/turnos/${fixtures.ids.id(101)}`, "/boletos", `/boletos/${fixtures.ids.id(301)}`, "/boletos/agenda", "/boletos/fornecedores",
  "/contas", `/contas/${fixtures.ids.id(22)}`, "/conciliacao", "/receber", "/relatorios", "/relatorios/daily_close", "/relatorios/sales_by_method", "/relatorios/bills",
  "/notificacoes", "/equipe", "/configuracoes", "/auditoria"];

test.describe("proprietário: todas as telas renderizam sem erro (desktop)", () => {
  test.use({ viewport: { width: 1366, height: 860 } });
  for (const path of ADMIN_PAGES) {
    test(path, async ({ page, context }, info) => {
      await login(context, U.owner);
      const errs = errors(page);
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page, "não pode ter sido redirecionado ao login").toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`));
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Entrar" })).toHaveCount(0);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: info.outputPath("shot.png"), fullPage: path === "/painel" });
      expect(errs, errs.join("\n")).toEqual([]);
    });
  }
});

test.describe("celular (390×844): proprietário e operador", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  for (const path of ["/painel", "/boletos", "/caixa/turnos", "/relatorios/sales_by_method", "/contas"]) {
    test(`dono ${path} sem rolagem horizontal + navegação inferior`, async ({ page, context }, info) => {
      await login(context, U.owner);
      const errs = errors(page);
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: "Principal" }).last()).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), "overflow horizontal").toBeLessThanOrEqual(0);
      await page.screenshot({ path: info.outputPath("shot.png") });
      expect(errs, errs.join("\n")).toEqual([]);
    });
  }
  test("operador: só vê o caixa (sem menus financeiros) e a tela de lançamento", async ({ page, context }, info) => {
    await login(context, U.cashier);
    const errs = errors(page);
    await page.goto("/caixa");
    await expect(page.getByRole("heading", { name: "Meu turno" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Fechar turno/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Boletos|Resumos|Equipe/ })).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: info.outputPath("operador-caixa.png"), fullPage: true });
    expect(errs, errs.join("\n")).toEqual([]);
  });
});

test.describe("permissões na interface", () => {
  test("operador é redirecionado ao caixa ao tentar abrir telas financeiras", async ({ page, context }) => {
    await login(context, U.cashier);
    for (const path of ["/painel", "/boletos", "/contas", "/relatorios", "/equipe", "/configuracoes", "/auditoria", "/conciliacao"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/caixa$/);
    }
  });
  test("operador não baixa exportações de relatório", async ({ context }) => {
    await login(context, U.cashier);
    const res = await context.request.get("/api/reports/daily_close/export?format=csv");
    expect(res.status()).toBe(403);
  });
  test("gerente não vê opção de criar gerente/proprietário", async ({ page, context }) => {
    await login(context, U.manager);
    await page.goto("/equipe");
    await page.getByRole("button", { name: "Novo acesso" }).click();
    const options = await page.locator("dialog select[name=role] option").allTextContents();
    expect(options).toEqual(["Operador de caixa"]);
  });
});

test.describe("interações da interface", () => {
  test.use({ viewport: { width: 1366, height: 860 } });
  test("fechamento simples: mostra quanto retirar, deixa R$ 150 de troco e calcula a diferença", async ({ page, context }, info) => {
    await login(context, U.cashier);
    await page.goto("/caixa");
    await page.getByLabel("Dinheiro", { exact: true }).fill("500,00");
    await page.getByLabel("Total contado (notas e moedas)").fill("650,00");
    await expect(page.getByText("Retirar da gaveta")).toBeVisible();
    await expect(page.getByText(/R\$\s*500,00/).first()).toBeVisible();
    await expect(page.getByText("Deixar de troco")).toBeVisible();
    await expect(page.getByText("Caixa bateu")).toBeVisible();      // abertura 150 + 500 de vendas = 650 esperado
    await page.screenshot({ path: info.outputPath("fechamento.png"), fullPage: true });
  });
  test("boletos: agrupados por mês e data, vencido em destaque, abas A pagar/Pagos", async ({ page, context }) => {
    await login(context, U.owner);
    await page.goto("/boletos");
    await expect(page.getByRole("tab", { name: "A pagar" })).toHaveAttribute("aria-selected", "true");
    const items = page.locator("main ul li");
    expect(await items.count()).toBeGreaterThanOrEqual(3);
    await expect(page.getByText("Ambev Distribuição").first()).toBeVisible();
    await expect(page.getByText("Vencido").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Pagar" }).first()).toBeVisible();
    await page.getByRole("tab", { name: "Pagos" }).click();
    await expect(page).toHaveURL(/ver=pagos/);
    await expect(page.getByText("Transportadora Rota")).toBeVisible();
  });
  test("novo boleto: modal com parcelamento mostra campos extras", async ({ page, context }) => {
    await login(context, U.owner);
    await page.goto("/boletos");
    await page.getByRole("button", { name: "Novo boleto" }).click();
    const d = page.getByRole("dialog");
    await expect(d.getByLabel("Linha digitável (opcional)")).toBeVisible();
    await d.getByLabel("Tipo").selectOption("installments");
    await expect(d.getByLabel("Nº de parcelas")).toBeVisible();
    await expect(d.getByLabel("Valor total")).toBeVisible();
  });
});
