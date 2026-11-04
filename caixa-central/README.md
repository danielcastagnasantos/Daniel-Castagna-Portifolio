# Caixa Central

Sistema de gestão financeira para uma distribuidora de bebidas: **caixa por turnos** (uma gaveta, 2–3 operadores), **livro‑razão**, **boletos e contas a pagar**, **contas e conciliação bancária**, **relatórios** e **painel do proprietário** no celular (PWA).

> Ferramenta de **gestão interna**. Não emite nota fiscal, não substitui sistema fiscal/contábil homologado e não se conecta a bancos nem paga boletos. Todo número depende de lançamentos corretos — confira sempre com o extrato do banco.

**Stack:** Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Auth, PostgreSQL, Storage) · Recharts · Zod · pdf‑lib / ExcelJS · Vitest · Playwright.

## Documentação

| Documento | Para quem |
|---|---|
| [docs/MANUAL-FUNCIONARIOS.md](docs/MANUAL-FUNCIONARIOS.md) | Operadores de caixa |
| [docs/MANUAL-ADMINISTRATIVO.md](docs/MANUAL-ADMINISTRATIVO.md) | Gerente e proprietário |
| [docs/PRODUCAO.md](docs/PRODUCAO.md) | Publicar (Supabase + Vercel), passo a passo |
| [docs/BACKUP.md](docs/BACKUP.md) | Backup, recuperação e retenção |
| [docs/SEGURANCA.md](docs/SEGURANCA.md) | Modelo de segurança e limites |
| [docs/ROTEIRO-DE-ACEITE.md](docs/ROTEIRO-DE-ACEITE.md) | Checklist antes de usar dinheiro real |

## O que o sistema faz

- **Acessos individuais** com 3 perfis — Proprietário, Gerente, Operador — e gestão de equipe pela tela (criar acesso, senha provisória, desativar, trocar perfil). Ninguém altera o próprio nível de acesso.
- **Turnos de caixa:** abertura com contagem, **um único turno aberto por gaveta** (garantido no banco), vendas em dinheiro/Pix/débito/crédito/transferência, sangria, suprimento, despesa, estorno, fechamento com **dinheiro esperado × contado**, diferença e justificativa, **fechamento cego** configurável, **passagem de turno com conferência obrigatória**, conferência pelo gerente, comprovante em PDF. Turno fechado é congelado.
- **Livro‑razão imutável** com contas separadas (gaveta, cofre, banco, Pix, cartão a receber). Correções são **estornos rastreáveis**; nada é apagado. Transferência e liquidação de cartão **não** são receita.
- **Painel** que não mistura faturamento, dinheiro, saldo bancário e cartão a receber; gráficos diário/semanal/mensal; vencimentos; diferenças; atrasos.
- **Boletos:** fornecedores, único/parcelado/recorrente (centavos exatos), anexos privados (PDF/imagem), pagamento parcial **só com confirmação humana**, comprovante, histórico de alterações, agenda de 7/15/30 dias.
- **Conciliação:** importa extrato **CSV/OFX**, detecta duplicidades, concilia manualmente, cria lançamento para tarifas/rendimentos.
- **Relatórios** (10) com filtros e exportação **PDF, Excel e CSV**, sempre calculados do banco.
- **Notificações** (vencimentos, atrasos, diferenças, caixa aberto há muito tempo, aprovações) + e‑mail opcional.
- **PWA instalável**, modo claro/escuro, layout para celular/tablet/desktop, **sem fila offline** de propósito: sem internet o sistema bloqueia o salvamento em vez de fingir que salvou.

## Arquitetura em uma página

```
Navegador ──(Server Actions + cookies de sessão)──▶ Next.js (valida com Zod, checa sessão)
                                                        │  supabase.rpc(...)  (JWT do usuário)
                                                        ▼
                                         PostgreSQL (Supabase) — AUTORIDADE FINAL
                                         • RLS em todas as tabelas • funções RPC transacionais
                                         • razão imutável • auditoria append‑only • trava de linha
```

- **O navegador não grava em tabelas.** Toda escrita é uma função (`public.*`) `security definer` que valida perfil, empresa e dados. Um teste automático (`tests/db/contract.test.ts`) garante isso.
- **Dinheiro = inteiro em centavos** (`bigint`). Nenhum cálculo financeiro usa ponto flutuante.
- **Idempotência:** cada operação carrega uma chave única; repetir após falha de rede **não duplica** (turno, lançamento, fechamento, pagamento, transferência…).
- **Concorrência:** trava de linha na gaveta/turno/boleto; índices únicos parciais impedem dois turnos abertos.
- Migrations versionadas em `supabase/migrations/` (0001…0009). O MVP original ficou em `legacy-mvp/` apenas como referência.

## Variáveis de ambiente

Copie `.env.example` para `.env.local`.

| Variável | Onde | Para quê |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | navegador+servidor | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | navegador+servidor | chave publicável (pode ser pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | **só servidor** | cadastro inicial, criar/bloquear logins, rotina agendada. **Nunca** `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_URL` | servidor | links em e‑mails |
| `SETUP_TOKEN` | servidor | código do cadastro inicial (**obrigatório em produção**) |
| `CRON_SECRET` | servidor | autoriza `/api/cron/notifications` |
| `EMAIL_PROVIDER` / `RESEND_API_KEY` / `EMAIL_FROM` | servidor | e‑mail de alertas (opcional; `none` = só dentro do sistema) |

## Rodando no seu computador

Pré‑requisitos: Node 22+, [Supabase CLI](https://supabase.com/docs/guides/cli) e Docker.

```bash
cd caixa-central
npm install
supabase start                 # sobe o Supabase local e aplica migrations + supabase/seed.sql (dados FICTÍCIOS)
cp .env.example .env.local     # preencha URL/chaves exibidas por `supabase status`
npm run dev                    # http://localhost:3000
```

Logins de desenvolvimento (senha `Dev-Senha-123`): `dono@dev.local`, `gerente@dev.local`, `ana@dev.local`, `bruno@dev.local`. **O seed nunca é aplicado em produção.**

Sem seed (banco vazio): abra `/setup` para criar a empresa e o proprietário.

## Testes

```bash
npm run lint && npm run typecheck
npm test                 # unitários + integração em PostgreSQL REAL (precisa de um Postgres local, veja abaixo)
npm run test:e2e         # Playwright sem backend: PWA, redirecionamentos, segurança, layout, tema
npm run test:visual      # Playwright com fixtures fictícias: renderiza todas as telas por perfil/viewport
npm run build
```

Os testes de banco usam `TEST_DATABASE_URL` (padrão `postgres://postgres:postgres@127.0.0.1:5432/postgres`), criam um banco descartável por arquivo, aplicam um *stub* mínimo do Supabase (`tests/db/supabase-stub.sql`) e **todas as migrations reais**. Cobrem: RLS e privilégios, isolamento entre empresas, permissões por perfil, turnos (incluindo o exemplo R$ 200 + 500 + 300 − 100 ⇒ R$ 600 esperado, contou 580 ⇒ −R$ 20), concorrência com conexões simultâneas, idempotência, boletos/parcelas/pagamentos, razão, conciliação, relatórios, storage privado, backup/restore.

**O que não foi possível executar** e por quê: veja a seção *Limites dos testes* em [docs/SEGURANCA.md](docs/SEGURANCA.md) — principalmente o fluxo completo contra Supabase real (sem Docker no ambiente de desenvolvimento).

## Publicar

Resumo (detalhes em [docs/PRODUCAO.md](docs/PRODUCAO.md)): criar projeto Supabase → `supabase db push` → configurar Auth/e‑mail → criar projeto na Vercel com *Root Directory* `caixa-central` → variáveis de ambiente → abrir `/setup` → seguir o [roteiro de aceite](docs/ROTEIRO-DE-ACEITE.md).

## Estrutura

```
src/app/            páginas (App Router), Server Actions (app/actions), rotas de API (PDF/Excel/CSV, cron, health)
src/components/     UI (ui/, forms/, shell/, cash/, bills/, finance/, team/, charts/)
src/lib/            dinheiro, datas, schemas Zod, auth, relatórios/exportação, extratos CSV/OFX, e‑mail
supabase/           migrations/, seed.sql (dev), config.toml, templates de e‑mail
tests/              db/ (PostgreSQL real), e2e/, e2e-visual/
scripts/            backup/restore, ícones, reset de banco local, runner de e2e
legacy-mvp/         MVP original (referência; não é usado)
```
