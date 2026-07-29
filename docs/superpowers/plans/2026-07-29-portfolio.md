# Portfólio Daniel Castagna — Plano de Implementação

> **Desvio registrado:** a skill `writing-plans` exige código completo inline em cada passo, porque pressupõe um implementador sem contexto. Aqui o implementador é a mesma sessão que escreveu a spec. O plano define decomposição, arquivos e contratos de interface; o código vai direto aos arquivos. Cada tarefa termina com verificação e commit.

**Goal:** Portfólio bilíngue, página única, com cena 3D persistente, padrão visual premium.

**Architecture:** Next.js 16 App Router, rota `[locale]`, um `<Canvas>` R3F fixo no layout dirigido por store Zustand alimentado pelo lenis. Texto em `messages/*.json`, dados em `src/content/`.

**Tech Stack:** Next 16.2.12, React 19.2.4, TS strict, Tailwind v4, R3F 9, drei 10, postprocessing, motion 12, lenis 1.3, next-intl 4, zustand 5, Vitest.

## Global Constraints

- Paleta exata: `--bg #050505`, `--card #101014`, `--primary #7C3AED`, `--secondary #A855F7`, `--glow #C084FC`, `--text #FFFFFF`, `--muted #A1A1AA`, `--line rgba(124,58,237,.25)`, `--glass rgba(255,255,255,.05)`
- Fontes: Space Grotesk (títulos), Inter (texto), JetBrains Mono (código/números)
- Nenhuma string de copy literal em componente — tudo via `useTranslations`
- Nenhum dado inventado: só o projeto Tô Chegando é real
- Stats: 12 Tecnologias, 9 Meses, Lighthouse (valor medido), 100% Responsivo
- `--primary` nunca como cor de texto pequeno (contraste 3.9:1)
- Canvas 3D `aria-hidden="true"`, `pointer-events: none`
- `prefers-reduced-motion` desliga parallax, cursor, typing e congela a cena
- TypeScript `strict`, sem `any`

---

### Task 1: Fundação — tokens, fontes, i18n, config de conteúdo

**Files:**
- Modify: `src/app/globals.css`, `next.config.ts`, `tsconfig.json`
- Create: `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/middleware.ts`
- Create: `messages/pt.json`, `messages/en.json`
- Create: `src/content/site.config.ts`, `src/content/technologies.ts`, `src/content/projects.ts`
- Create: `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`
- Delete: `src/app/page.tsx`, `src/app/layout.tsx`

**Interfaces produzidas:**
- `routing: { locales: ['pt','en'], defaultLocale: 'pt' }`
- `siteConfig: { links: Record<LinkKey, string | null>, photo: string | null, resume: string | null }`
- `isLinkActive(key: LinkKey): boolean`
- `technologies: Tech[]` onde `Tech = { name: string; category: 'lang'|'framework'|'tool'|'db' }`
- `projects: Project[]` onde `Project = { slug, url, stack: string[], live: boolean }`

**Verificação:** `npm run build` conclui; `/pt` e `/en` respondem; `/` redireciona.

---

### Task 2: Store, hooks e primitivos de UI

**Files:**
- Create: `src/store/scene.ts`, `src/hooks/useLenis.ts`, `src/hooks/useSectionObserver.ts`, `src/hooks/useIsTouch.ts`
- Create: `src/components/ui/Reveal.tsx`, `Counter.tsx`, `GlassCard.tsx`, `SectionHeading.tsx`, `Cursor.tsx`, `Preloader.tsx`

**Interfaces produzidas:**
- `useSceneStore: { scrollProgress: number; activeSection: SectionId; set... }`
- `SectionId = 'hero'|'about'|'stats'|'tech'|'services'|'projects'|'differentials'|'process'|'contact'`
- `<Reveal delay?: number>`, `<Counter to: number, suffix?: string>`, `<GlassCard>`, `<SectionHeading eyebrow, title>`

**Verificação:** build limpo; contador chega ao valor final (teste).

---

### Task 3: Cena 3D

**Files:**
- Create: `src/components/three/Scene.tsx`, `Notebook.tsx`, `Particles.tsx`, `NeuralNetwork.tsx`, `InfiniteGrid.tsx`, `FloatingObjects.tsx`, `Effects.tsx`
- Create: `src/lib/sceneConfig.ts` — função pura `configForProgress(p: number): SceneConfig`

**Interfaces produzidas:**
- `SceneConfig = { cameraZ: number; particleDensity: number; bloomIntensity: number; show: { notebook: boolean; neural: boolean; grid: boolean } }`

**Verificação:** cena renderiza sem erro de WebGL no console; teste de `configForProgress` nos limites.

---

### Task 4: Header, Footer e seções Hero + Sobre

**Files:**
- Create: `src/components/layout/Header.tsx`, `Footer.tsx`
- Create: `src/components/sections/Hero.tsx`, `About.tsx`

**Verificação:** navegação por âncora funciona; seletor de idioma troca rota preservando âncora.

---

### Task 5: Stats, Tecnologias, Serviços

**Files:**
- Create: `src/components/sections/Stats.tsx`, `Technologies.tsx`, `Services.tsx`

**Verificação:** 12 techs com tooltip acessível; contadores animam ao entrar na viewport.

---

### Task 6: Projetos, Diferenciais, Processo, Contato

**Files:**
- Create: `src/components/sections/Projects.tsx`, `Differentials.tsx`, `Process.tsx`, `Contact.tsx`

**Verificação:** card do Tô Chegando com link real funcionando; botões sem link renderizam desabilitados.

---

### Task 7: SEO, acessibilidade e metadata

**Files:**
- Create: `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/icon.tsx`, `src/app/opengraph-image.tsx`
- Modify: `src/app/[locale]/layout.tsx` — metadata completa + JSON-LD

**Verificação:** `/sitemap.xml` e `/robots.txt` respondem; JSON-LD válido; hreflang presente.

---

### Task 8: Testes

**Files:**
- Create: `vitest.config.ts`, `src/content/site.config.test.ts`, `src/lib/sceneConfig.test.ts`, `src/lib/counter.test.ts`, `messages/messages.test.ts`

**Verificação:** `npm test` verde; cada teste nomeia a quebra que pega.

---

### Task 9: Verificação final

Build de produção, `tsc --noEmit`, lint, teste de responsividade em 360/768/1280/1920/2560, medição Lighthouse real, atualização do card com o valor medido.
