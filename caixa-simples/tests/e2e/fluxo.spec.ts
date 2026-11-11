import { expect, test, type Page } from "@playwright/test";

const FAKE = "http://127.0.0.1:54400";
const hojeISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const diasAtras = (n: number) => { const d = new Date(`${hojeISO()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

test.beforeEach(async ({ request }) => { await request.post(`${FAKE}/__reset`); });

async function entrar(page: Page, email = "dono@teste.com", senha = "senha12345") {
  await page.goto("/");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function lancar(page: Page, o: { tipo: "entrada" | "saida"; valor: string; categoria?: string; data?: string; cartao?: boolean; descricao?: string }) {
  await page.getByRole("button", { name: o.tipo === "entrada" ? "+ Entrou" : "− Saiu" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Quanto foi? (R$)").fill(o.valor);
  if (o.cartao) await d.getByRole("button", { name: "Cartão", exact: true }).click();
  if (o.data) {
    await d.getByRole("button", { name: "Outro dia" }).click();
    await d.getByLabel("Escolha o dia").fill(o.data);
  }
  if (o.categoria) await d.getByRole("button", { name: o.categoria, exact: true }).click();
  if (o.descricao) await d.getByLabel(/Observação/).fill(o.descricao);
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(d).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Salvo");
}

test("login: senha errada mostra erro; certa abre o caixa vazio", async ({ page }) => {
  await entrar(page, "dono@teste.com", "errada");
  await expect(page.locator("main").getByRole("alert")).toHaveText("E-mail ou senha incorretos.");
  await page.getByLabel("Senha").fill("senha12345");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByTestId("saldo-dinheiro")).toHaveText(/R\$\s*0,00/);
  await expect(page.getByText("Ainda não tem nada aqui.")).toBeVisible();
});

test("EXEMPLO DO PAI: 340 de manhã + caixa antigo = 1.200 em caixa; sai 800 de mercadoria; sobra 400", async ({ page }) => {
  await entrar(page);
  await lancar(page, { tipo: "entrada", valor: "340", categoria: "Venda", descricao: "Vendas da manhã" });
  await expect(page.getByTestId("saldo-dinheiro")).toHaveText(/R\$\s*340,00/);

  await lancar(page, { tipo: "entrada", valor: "860", categoria: "Caixa anterior", data: diasAtras(3), descricao: "Dinheiro dos últimos dias" });
  await expect(page.getByTestId("saldo-dinheiro")).toHaveText(/R\$\s*1\.200,00/);        // 340 + 860

  await lancar(page, { tipo: "saida", valor: "800", categoria: "Mercadoria", descricao: "Pedido do fornecedor" });
  await expect(page.getByTestId("saldo-dinheiro")).toHaveText(/R\$\s*400,00/);           // sobrou 400

  // O dia de hoje mostra o dinheiro acumulado no fim do dia (inclui o caixa antigo)
  await page.getByRole("tab", { name: "Semana" }).click();
  const hoje = page.getByRole("region", { name: /hoje|Dia/ }).first();
  await expect(hoje.getByTestId("acumulado")).toHaveText(/R\$\s*400,00/);
  await expect(page.getByTestId("res-entradas")).toContainText("340,00");
});

test("cartão fica separado do dinheiro", async ({ page }) => {
  await entrar(page);
  await lancar(page, { tipo: "entrada", valor: "500", categoria: "Venda" });
  await lancar(page, { tipo: "entrada", valor: "250,50", categoria: "Venda", cartao: true, descricao: "Cartão da tarde" });
  await lancar(page, { tipo: "saida", valor: "50", categoria: "Mercadoria", cartao: true });
  await expect(page.getByTestId("saldo-dinheiro")).toHaveText(/R\$\s*500,00/);
  await expect(page.getByTestId("saldo-cartao")).toHaveText(/R\$\s*200,50/);
});

test("editar e excluir atualizam os saldos; exclusão pede confirmação", async ({ page }) => {
  await entrar(page);
  await lancar(page, { tipo: "entrada", valor: "100", categoria: "Venda" });
  await page.getByRole("button", { name: /Venda/ }).first().click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Quanto foi? (R$)").fill("150");
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("saldo-dinheiro")).toHaveText(/R\$\s*150,00/);
  await page.getByRole("button", { name: /Venda/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();                                  // ainda não excluiu
  await page.getByRole("dialog").getByRole("button", { name: "Sim, excluir" }).click();
  await expect(page.getByTestId("saldo-dinheiro")).toHaveText(/R\$\s*0,00/);
});

test("validação: valor vazio/zero e data futura são recusados sem gravar", async ({ page, request }) => {
  await entrar(page);
  await page.getByRole("button", { name: "+ Entrou" }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(d.getByRole("alert")).toContainText("Digite quanto foi");
  await d.getByLabel("Quanto foi? (R$)").fill("0");
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(d.getByRole("alert")).toContainText("Digite quanto foi");
  await d.getByLabel("Quanto foi? (R$)").fill("10");
  await d.getByRole("button", { name: "Outro dia" }).click();
  await d.getByLabel("Escolha o dia").fill("2999-01-01");
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(d.getByRole("alert")).toContainText("futuro");
  expect(await (await request.get(`${FAKE}/__rows`)).json()).toHaveLength(0);
});

test("lançar é fácil: Hoje já vem escolhido, Ontem e categoria 'Outro' com texto livre", async ({ page, request }) => {
  await entrar(page);
  await page.getByRole("button", { name: "+ Saiu" }).or(page.getByRole("button", { name: "− Saiu" })).click();
  const d = page.getByRole("dialog");
  await expect(d.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "true");
  await d.getByLabel("Quanto foi? (R$)").fill("45");
  await d.getByRole("button", { name: "Ontem" }).click();
  await d.getByRole("button", { name: "Outro", exact: true }).click();
  await d.getByLabel("Digite de quê foi").fill("Conserto da porta");
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(d).toBeHidden();
  const rows = await (await request.get(`${FAKE}/__rows`)).json();
  expect(rows[0]).toMatchObject({ tipo: "saida", categoria: "Conserto da porta", valor_centavos: 4500 });
  await expect(page.getByTestId("saldo-dinheiro")).toHaveText(/-R\$\s*45,00/);
});

test("sem conexão: não confirma como salvo; ao tentar de novo grava UMA vez (mesma chave)", async ({ page, request }) => {
  await entrar(page);
  await expect(page.getByTestId("saldo-dinheiro")).toBeVisible();
  const ids: string[] = [];
  await page.route("**/rest/v1/lancamentos", async (route) => {
    if (route.request().method() === "POST") { ids.push(route.request().postDataJSON().id); return route.abort("failed"); }
    return route.continue();
  });
  await page.getByRole("button", { name: "+ Entrou" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Quanto foi? (R$)").fill("77");
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(d.getByRole("alert")).toContainText("Sem conexão");
  await expect(d).toBeVisible();                                                           // os dados continuam na tela
  expect(await (await request.get(`${FAKE}/__rows`)).json()).toHaveLength(0);              // nada foi salvo

  await page.unroute("**/rest/v1/lancamentos");
  page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/lancamentos")) ids.push(r.postDataJSON().id); });
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(d).toBeHidden();
  const rows = await (await request.get(`${FAKE}/__rows`)).json();
  expect(rows).toHaveLength(1);
  expect(new Set(ids).size).toBe(1);                                                       // mesma chave nas duas tentativas
  await expect(page.getByTestId("saldo-dinheiro")).toHaveText(/R\$\s*77,00/);
});

test("quem não foi liberado vê o aviso e não consegue lançar", async ({ page }) => {
  await entrar(page, "intruso@teste.com");
  await expect(page.locator("main").getByRole("alert")).toContainText("ainda não foi liberado");
  await expect(page.getByRole("button", { name: "+ Entrou" })).toHaveCount(0);
});

test("os dados e o login continuam depois de recarregar; sair volta ao login", async ({ page }) => {
  await entrar(page);
  await lancar(page, { tipo: "entrada", valor: "321", categoria: "Venda" });
  await page.reload();
  await expect(page.getByTestId("saldo-dinheiro")).toHaveText(/R\$\s*321,00/);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("baixar planilha (CSV) traz os lançamentos do período, saída com sinal negativo", async ({ page }) => {
  await entrar(page);
  await lancar(page, { tipo: "entrada", valor: "340", categoria: "Venda", descricao: "Manhã" });
  await lancar(page, { tipo: "saida", valor: "80", categoria: "Mercadoria" });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Baixar planilha/ }).click()]);
  const txt = await (await import("node:fs/promises")).readFile(await dl.path(), "utf8");
  expect(txt).toContain("Data;Tipo;Forma;Categoria;Descrição;Valor (R$)");
  expect(txt).toMatch(/Entrada;Dinheiro;Venda;Manhã;340,00/);
  expect(txt).toMatch(/Saída;Dinheiro;Mercadoria;;-80,00/);
});

test.describe("celular e tema", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("sem rolagem horizontal, botões grandes e dialog cabe na tela", async ({ page }, info) => {
    await entrar(page);
    await lancar(page, { tipo: "entrada", valor: "1234,56", categoria: "Venda", descricao: "Manhã" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: info.outputPath("celular.png"), fullPage: true });
    await page.getByRole("button", { name: "− Saiu" }).click();
    const box = await page.getByRole("dialog").boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
    await page.waitForTimeout(400);
    await page.screenshot({ path: info.outputPath("celular-lancar.png") });
  });
  test("modo escuro automático", async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: "dark", viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto("/");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(11, 13, 18)");
    await ctx.close();
  });
});

test("instalável: manifest e ícones", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m).toMatchObject({ name: "Caixa Simples", display: "standalone", lang: "pt-BR" });
  for (const i of m.icons) expect((await request.get(i.src)).status()).toBe(200);
});
