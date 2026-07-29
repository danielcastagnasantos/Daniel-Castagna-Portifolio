# Portfólio Daniel Castagna — Design

**Data:** 2026-07-29
**Status:** Aprovado (Parte 1 aprovada pelo usuário; Parte 2 decidida autonomamente por delegação explícita)

## Objetivo

Portfólio pessoal de Daniel Castagna Santos, Desenvolvedor Full Stack, que funcione como vitrine profissional principal. Precisa converter visitantes em clientes e impressionar recrutadores nos primeiros segundos, com padrão visual comparável a Linear, Vercel, Framer e Arc Browser.

## Decisões tomadas com o usuário

| Decisão | Escolha | Consequência aceita |
|---|---|---|
| 3D vs Performance | **Espetáculo primeiro** — cena 3D completa em todos os dispositivos | Lighthouse Performance ~70-85 no mobile. SEO, A11y e Best Practices seguem >95 em todos. |
| Stack | **Next.js App Router** | Metadata API nativa resolve OG, Twitter Cards, canonical e Schema.org |
| Estatísticas | **Reformular** — sai Projetos/Clientes | Cards: 12 Tecnologias, 9 Meses, Lighthouse, 100% Responsivo |

O valor do card Lighthouse é definido pela medição real no build final e não antes. Se a medição der 93, o card mostra 93.
| Idioma | **Bilíngue PT + EN** | Todo texto em arquivos de mensagem; nunca hardcoded em componente |
| Arquitetura | **Página única + canvas persistente** | Um contexto WebGL, narrativa contínua de scroll |

## Dados reais do usuário

- **Nome:** Daniel Castagna Santos
- **Cargo:** Full Stack Developer
- **Slogan:** Transformando ideias em experiências digitais.
- **Experiência:** 9 meses desenvolvendo
- **Tecnologias (12):** HTML, CSS, JavaScript, TypeScript, React, Next.js, Node.js, Git, GitHub, Vercel, Firebase, Supabase
- **Projeto real:** Tô Chegando Bar e Restaurante — https://tochegandobar-three.vercel.app — bar/restaurante em Vila Velha (ES). Site em Next.js com sistema de reservas, cardápio, galeria, FAQ, integração Instagram e WhatsApp.

**Regra de integridade:** nenhum número, cliente ou projeto inventado. A seção Projetos exibe apenas trabalho real. O portfólio entra como segundo card quando publicado.

## Stack

- Next.js 16.2.12 (App Router) · React 19.2.4 · TypeScript `strict`
- Tailwind CSS v4
- React Three Fiber 9 · drei 10 · postprocessing
- motion (Framer Motion v12) · lenis
- next-intl 4 · zustand 5
- Deploy: Vercel

**GSAP excluído (YAGNI):** `useScroll` do motion + lenis cobrem scroll-linked animation, parallax e reveal. GSAP adicionaria ~50 KB duplicando capacidade existente.

**Sem `output: 'export'`:** export estático quebra o middleware do next-intl, que faz a detecção e o redirecionamento de idioma. Build padrão na Vercel com páginas geradas estaticamente.

## Identidade visual

**Paleta** (tokens CSS em `globals.css`):

| Token | Valor |
|---|---|
| `--bg` | `#050505` |
| `--card` | `#101014` |
| `--primary` | `#7C3AED` |
| `--secondary` | `#A855F7` |
| `--glow` | `#C084FC` |
| `--text` | `#FFFFFF` |
| `--muted` | `#A1A1AA` |
| `--line` | `rgba(124,58,237,.25)` |
| `--glass` | `rgba(255,255,255,.05)` |

**Tipografia** via `next/font/google` com `display: swap` e subset latin:
- Títulos: Space Grotesk (`--font-display`)
- Texto: Inter (`--font-body`)
- Código/números: JetBrains Mono (`--font-mono`)

**Contraste:** `--muted` `#A1A1AA` sobre `--bg` `#050505` = 9.2:1, acima do mínimo WCAG AA (4.5:1). `--primary` `#7C3AED` sobre `#050505` = 3.9:1 — insuficiente para texto pequeno, portanto usado apenas em bordas, glows, ícones grandes e elementos não-textuais. Texto sobre roxo usa `#FFFFFF`.

## Arquitetura

### Rotas

```
/                  → middleware redireciona para /pt ou /en (Accept-Language)
/pt                → página única, todas as seções
/en                → página única, todas as seções
/sitemap.xml       → gerado por código, ambos idiomas
/robots.txt        → gerado por código
```

### Estrutura de arquivos

```
src/
  app/
    [locale]/
      layout.tsx          Fontes, providers, metadata por idioma, JSON-LD
      page.tsx            Composição das seções
    globals.css           Tokens, reset, utilitários, prefers-reduced-motion
    sitemap.ts            Sitemap com alternates hreflang
    robots.ts             robots.txt
  components/
    layout/
      Header.tsx          Nav âncora + seletor de idioma
      Footer.tsx          Logo, redes, voltar ao topo, copyright automático
    sections/
      Hero.tsx            Título, typing effect, CTAs
      About.tsx           Foto, bio
      Stats.tsx           4 contadores animados
      Technologies.tsx    12 techs com ícone, glow, tooltip
      Services.tsx        11 cards de serviço
      Projects.tsx        Cards de projeto real
      Differentials.tsx   9 cards de diferencial
      Process.tsx         Timeline de 6 etapas
      Contact.tsx         Botões grandes de contato
    three/
      Scene.tsx           <Canvas> único, fixo, pointer-events none
      Notebook.tsx        Notebook procedural low-poly
      Particles.tsx       Campo de partículas
      NeuralNetwork.tsx   Nós + linhas pulsantes
      InfiniteGrid.tsx    Grid com fuga em perspectiva
      FloatingObjects.tsx Cubos, esferas, hexágonos, anéis
      Effects.tsx         Bloom seletivo
    ui/
      Cursor.tsx          Cursor customizado
      Preloader.tsx       Loading ligado ao useProgress
      Reveal.tsx          Wrapper de scroll reveal
      Counter.tsx         Contador animado
      GlassCard.tsx       Card glassmorphism reutilizável
      SectionHeading.tsx  Cabeçalho de seção
  hooks/
    useLenis.ts           Smooth scroll + sync com R3F
    useSectionObserver.ts IntersectionObserver → store
    useReducedMotion.ts   Preferência de movimento
    useIsTouch.ts         Detecção de dispositivo de toque
  store/
    scene.ts              Zustand: progresso de scroll, seção ativa
  content/
    site.config.ts        Links, e-mail, WhatsApp, foto, PDF do currículo
    projects.ts           Dados dos projetos reais
    technologies.ts       12 tecnologias com ícone e categoria
  i18n/
    routing.ts            Configuração de rotas next-intl
    request.ts            Carregamento de mensagens
messages/
  pt.json                 Todo o texto em português
  en.json                 Todo o texto em inglês
```

**Princípio de fronteira:** cada componente de seção recebe seu texto via `useTranslations` e seus dados via import de `content/`. Nenhum componente contém string de copy literal. Componentes 3D leem apenas do store; não conhecem seções.

### Cena 3D

Um `<Canvas>` montado uma vez em `layout.tsx`, `position: fixed`, `inset: 0`, `z-index: -1`, `pointer-events: none`.

Store Zustand guarda `scrollProgress` (0-1) e `activeSection`. Alimentado pelo lenis via `useLenis`. Objetos leem o store dentro de `useFrame` e interpolam com amortecimento — nunca saltam.

| Seção | Estado da cena |
|---|---|
| Hero | Notebook flutuando, anéis girando, partículas densas |
| About / Stats | Câmera recua, esferas cromadas, partículas rarefeitas |
| Technologies | Rede neural com nós conectados pulsando |
| Services / Projects | Hexágonos e cubos em profundidade, opacidade reduzida |
| Process | Grid infinito com fuga em perspectiva |
| Contact | Convergência de partículas, glow intensificado |

Geometria procedural sempre que possível. Nenhum GLTF externo — o notebook é construído com `boxGeometry` e materiais. Bloom seletivo via `@react-three/postprocessing`.

Reação ao mouse: câmera faz lerp em direção ao ponteiro normalizado com amortecimento, gerando parallax de profundidade.

### Acessibilidade

- `prefers-reduced-motion: reduce` desliga parallax, cursor customizado, typing effect e congela a cena 3D em um frame estático
- Canvas 3D é `aria-hidden="true"` — é decorativo
- Navegação por teclado em todos os interativos, com `:focus-visible` de anel roxo espesso
- Skip link para o conteúdo principal
- Landmarks semânticos: `header`, `main`, `nav`, `section` com `aria-labelledby`, `footer`
- Todas as imagens com `alt` descritivo
- Contraste verificado (ver Identidade visual)

### SEO

Metadata API do Next por idioma: title, description, Open Graph, Twitter Cards, canonical, alternates hreflang. JSON-LD com `Person` e `WebSite` injetado no layout. `sitemap.ts` e `robots.ts` gerados por código. Favicon e OG image gerados.

## Dados pendentes do usuário

Centralizados em `src/content/site.config.ts`. Enquanto vazios, os botões correspondentes renderizam **desabilitados com tooltip "em breve"** — nunca link morto.

- [ ] URL do Instagram
- [ ] URL do GitHub
- [ ] URL do LinkedIn
- [ ] Número do WhatsApp
- [ ] E-mail de contato público
- [ ] Foto profissional → `public/daniel.jpg`
- [ ] PDF do currículo → `public/curriculo.pdf`

## Estratégia de testes

O valor deste projeto é visual e de integração, não de lógica de domínio — há pouca lógica pura para testar unitariamente, e testes que apenas renderizam um componente e verificam que ele não quebrou são change detectors sem valor.

Testes onde existe lógica real que pode quebrar silenciosamente:

1. **`site.config`** — a função que decide se um link está ativo ou desabilitado. Quebra silenciosa: link morto em produção.
2. **Contadores** — a função de easing/interpolação chega exatamente ao valor final. Quebra silenciosa: contador para em 11 de 12.
3. **Mapeamento de seção → estado da cena** — função pura que converte `scrollProgress` em configuração. Quebra silenciosa: cena travada na configuração errada.
4. **Completude de mensagens** — toda chave em `pt.json` existe em `en.json` e vice-versa. Quebra silenciosa: texto faltando em um idioma.

Runner: **Vitest**. Cada teste nomeia a mudança de produção que o faria falhar.

Verificação final por build real (`npm run build`), lint limpo, `tsc --noEmit` limpo, e Lighthouse medido — número reportado é o medido, nunca o desejado.

## Desvios da spec durante a implementação

Registrados durante a construção, com o motivo:

1. **Next.js 16.2.12, não 15.** O `create-next-app@latest` instalou a 16. Mantida — é mais nova e o App Router é o mesmo. Consequência: a convenção `middleware.ts` foi renomeada para `proxy.ts`.

2. **Preloader não depende mais da cena 3D.** A spec previa `useProgress` do drei. Isso não funciona: `useProgress` rastreia carregamento de assets do three.js, e a cena é 100% procedural — não carrega nada, então o progresso ficaria em zero para sempre. Trocado por fontes carregadas + batida mínima. Mais importante, a dependência estava invertida: decoração não pode bloquear conteúdo.

3. **Saída do preloader em CSS, não em `AnimatePresence`.** Observado em teste: `AnimatePresence` só desmonta o elemento quando a animação de saída termina, e ela depende de `requestAnimationFrame`. Em aba sem composição o overlay cobria o site permanentemente. Com transição CSS, `visibility` e `pointer-events` mudam de imediato.

4. **`Math.random()` substituído por PRNG com semente.** Impuro dentro de `useMemo` sob as regras do React Compiler, e agora a cena é reproduzível entre visitas.

5. **Media queries via `useSyncExternalStore`.** Elimina `setState` dentro de efeito e a renderização em cascata que ele provoca.

6. **`react-hooks/immutability` desligado apenas em `src/components/three/`.** O three.js anima por mutação direta; criar objetos por frame geraria lixo constante.

## Critérios de sucesso

- `npm run build` conclui sem erro; `tsc --noEmit` e `eslint` limpos
- Lighthouse desktop: Performance >95, SEO >95, A11y >95, Best Practices >95
- Lighthouse mobile: SEO >95, A11y >95, Best Practices >95; Performance medida e reportada honestamente
- Layout íntegro em 360px, 768px, 1280px, 1920px e 2560px
- Navegação completa por teclado
- Ambos idiomas com todo o texto traduzido
