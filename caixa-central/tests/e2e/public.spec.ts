import { expect, test } from "@playwright/test";

test.describe("acesso e redirecionamentos", () => {
  test("visitante é levado ao login ao abrir qualquer página protegida", async ({ page }) => {
    for (const path of ["/", "/painel", "/caixa", "/boletos", "/relatorios/daily_close", "/equipe", "/contas", "/configuracoes"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login$/);
    }
  });

  test("rotas de arquivo e exportação exigem login (nada é servido anonimamente)", async ({ request }) => {
    for (const path of ["/api/reports/daily_close/export?format=csv", "/api/shifts/00000000-0000-0000-0000-000000000000/receipt"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([307, 308, 401], path).toContain(res.status());
      expect(res.headers()["content-type"] ?? "").not.toMatch(/pdf|csv|spreadsheet/);
    }
  });

  test("login mostra erro claro (sem travar) quando o servidor não responde", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("pai@distribuidora.com");
    await page.getByLabel("Senha").fill("senha-qualquer");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Sem conexão com o servidor|E-mail ou senha incorretos/ })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  test("cadastro inicial falha com mensagem útil se o banco não responde", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.getByText(/Não foi possível|Falta configurar/).first()).toBeVisible();
  });

  test("recuperação de senha não revela se o e-mail existe", async ({ page }) => {
    await page.goto("/login?esqueci=1");
    await page.getByLabel("E-mail").fill("qualquer@exemplo.com");
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(page.getByText(/receberá um link|Sem conexão|Não foi possível/).first()).toBeVisible();
  });
});

test.describe("PWA", () => {
  test("manifest instalável com ícones reais", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m).toMatchObject({ name: expect.stringContaining("Caixa Central"), display: "standalone", lang: "pt-BR", start_url: "/" });
    const purposes = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(purposes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const icon of m.icons) {
      const r = await request.get(icon.src);
      expect(r.status(), icon.src).toBe(200);
      expect(r.headers()["content-type"]).toContain("image/png");
    }
  });

  test("service worker não guarda dados autenticados e não fica preso em cache", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.headers()["cache-control"]).toContain("no-cache");
    const src = await res.text();
    expect(src).toContain("/offline");
    expect(src).not.toMatch(/\/api\/|supabase/i); // sem referência a APIs nem ao Supabase
    expect(src).toContain("/_next/static/");      // só estáticos versionados
    expect(src).toMatch(/req\.method !== "GET"/); // nunca intercepta gravações
  });

  test("página offline explica o que acontece", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: /sem internet/i })).toBeVisible();
    await expect(page.getByText(/dado como salvo sem confirmação/)).toBeVisible();
  });

  test("tags de instalação no HTML (tema, ícone iOS, manifest)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", /#/);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  });
});

test.describe("segurança de transporte e rotinas", () => {
  test("cabeçalhos de segurança", async ({ request }) => {
    const h = (await request.get("/login")).headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["referrer-policy"]).toBeTruthy();
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("rotina agendada exige o segredo", async ({ request }) => {
    expect((await request.get("/api/cron/notifications")).status()).toBe(401);
    expect((await request.get("/api/cron/notifications", { headers: { authorization: "Bearer errado" } })).status()).toBe(401);
    const ok = await request.get("/api/cron/notifications", { headers: { authorization: "Bearer e2e-cron-secret" } });
    expect([500, 502]).toContain(ok.status()); // autorizada, mas o banco de teste não existe: falha controlada em JSON
    expect(await ok.json()).toHaveProperty("error");
  });

  test("health check", async ({ request }) => {
    expect(await (await request.get("/api/health")).json()).toEqual({ status: "ok" });
  });
});

test.describe("layout responsivo e tema", () => {
  for (const [name, size] of [["celular", { width: 390, height: 844 }], ["tablet", { width: 820, height: 1180 }], ["desktop", { width: 1366, height: 800 }]] as const) {
    test(`login sem rolagem horizontal — ${name}`, async ({ page }, info) => {
      await page.setViewportSize(size);
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: info.outputPath(`login-${name}.png`) });
    });
  }

  test("modo escuro pela preferência do sistema e alternância manual", async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(11, 13, 18)");
    await page.getByRole("button", { name: /Tema:/ }).click(); // automático -> claro
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light"); // escolha lembrada
    await ctx.close();
  });

  test("campos de formulário têm rótulos acessíveis e foco visível", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("E-mail")).toHaveAttribute("type", "email");
    await expect(page.getByLabel("Senha")).toHaveAttribute("type", "password");
    await page.getByLabel("E-mail").focus();
    expect(await page.getByLabel("E-mail").evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
  });
});
