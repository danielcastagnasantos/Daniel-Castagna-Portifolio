# Portfólio — Daniel Castagna

Portfólio pessoal bilíngue com cena 3D dirigida por scroll.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 · React Three Fiber · motion · Lenis · next-intl · Vitest

## Rodando

```bash
npm install
npm run dev
```

Abre em `http://localhost:3000` e redireciona para `/pt` ou `/en` conforme o idioma do navegador.

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm test` | Suíte de testes (Vitest) |
| `npm run typecheck` | Verificação de tipos |
| `npm run lint` | ESLint |

## O que falta você preencher

Tudo está centralizado em **`src/content/site.config.ts`**. Enquanto um campo estiver `null`, o botão correspondente aparece desabilitado com a marcação "em breve" — nunca como link quebrado.

```ts
photo: null,      // → "/daniel.jpg"  (coloque o arquivo em public/)
resume: null,     // → "/curriculo.pdf"

links: {
  whatsapp: null,   // só dígitos com DDI: "5527999999999"
  email: null,      // "contato@exemplo.com"
  github: null,     // URL completa
  linkedin: null,   // URL completa
  instagram: null,  // URL completa
},
```

Preencher qualquer um deles acende o canal automaticamente na seção Contato, no rodapé e no `sameAs` do JSON-LD. Nenhum componente precisa ser alterado.

### Outros pendentes

- **Captura do Tô Chegando** — coloque em `public/` e aponte `image` em `src/content/projects.ts`. Sem ela o card mostra um bloco com gradiente.
- **Domínio real** — `siteConfig.url` está como `https://danielcastagna.dev`. Ele alimenta canonical, sitemap, robots e Open Graph; troque antes de publicar.
- **Card do Lighthouse** — `MEASURED_LIGHTHOUSE` em `src/components/sections/Stats.tsx` está `null`, então o card não aparece. Rode o Lighthouse no site publicado e coloque **o número medido**. Se der 93, escreva 93.

## Como o conteúdo é organizado

Nenhum texto vive dentro de componente. Para mudar qualquer palavra do site, edite `messages/pt.json` e `messages/en.json` — os dois têm exatamente as mesmas chaves, e existe um teste que falha se você adicionar copy em um idioma e esquecer do outro.

**Cargo e formação** ficam em `identity.role` e `identity.study`, dentro desses mesmos arquivos. Trocar ali muda o header, o rodapé, a seção Sobre, a imagem de compartilhamento e o `jobTitle` do JSON-LD de uma vez. Conforme você avançar no curso e ganhar bagagem, é uma linha por idioma.

```
messages/           Todo o texto, PT e EN
src/content/        Dados: links, tecnologias, projetos
src/components/
  sections/         Uma seção da página cada
  three/            Objetos da cena 3D
  ui/               Primitivos reutilizáveis
  layout/           Header, Footer
src/lib/            Lógica pura e testável
src/store/          Estado discreto (Zustand)
docs/superpowers/   Spec de design e plano de implementação
```

## Detalhes que não são óbvios

**A cena 3D é um canvas só.** Montado uma vez no layout, fixo atrás de todo o conteúdo. Ele muda de estado conforme a seção entra na viewport — a coreografia inteira está em `src/lib/sceneConfig.ts`, que é função pura e testada. Se a cena travar no visual errado, o defeito está lá.

**Scroll e posição do mouse não passam pelo React.** Vivem em `src/lib/sceneSignals.ts`, um objeto mutável lido só dentro do loop de renderização. Colocá-los em estado do React dispararia re-render da árvore inteira sessenta vezes por segundo.

**Acessibilidade não é opcional no código.** `prefers-reduced-motion` desliga parallax, cursor customizado, efeito de digitação e congela a cena. O canvas é `aria-hidden`. Se for mexer em animação, mantenha esse caminho funcionando.

**Decoração nunca bloqueia conteúdo.** O preloader não espera o WebGL. Se a GPU falhar, estiver bloqueada ou o navegador não suportar, o site carrega normalmente com fundo preto.
