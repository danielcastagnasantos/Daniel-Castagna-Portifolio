# E2E com banco real (NÃO executado no ambiente de desenvolvimento deste projeto)

Estes testes precisam de um Supabase local completo (`supabase start`, exige Docker). No ambiente em que o
projeto foi construído não havia Docker e a execução do PostgREST externo foi bloqueada, então
**esta suíte foi escrita mas nunca rodou**. A cobertura equivalente roda hoje em:

- `tests/db/*` — 61 testes de integração em PostgreSQL real (RLS, RPCs, concorrência, razão, conciliação);
- `tests/db/contract.test.ts` — garante que todas as chamadas do app batem com o schema real;
- `tests/e2e` e `tests/e2e-visual` — navegador real (Chromium) sem backend / com fixtures.

Para rodar o fluxo completo na sua máquina: veja "Teste completo com Supabase local" no README.
