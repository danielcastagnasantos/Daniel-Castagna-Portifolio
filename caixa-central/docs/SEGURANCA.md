# Segurança, auditoria e limites

## Modelo
1. **Autorização no banco.** RLS ligada em todas as 23 tabelas; o navegador/servidor com sessão de usuário **só lê** (e apenas o que o perfil permite). Toda escrita é por funções `security definer` que checam perfil, empresa e validam dados. Funções internas ficam em schema não exposto; funções de serviço (`svc_*`) só a `service_role`.
2. **Isolamento entre empresas:** toda tabela tem `organization_id`; políticas e funções comparam com a empresa do usuário ativo. Testado com duas empresas.
3. **Perfis:** operador não vê boletos, razão, contas, auditoria, equipe nem turnos de outros; só o proprietário muda perfis; gerente só gerencia operadores; ninguém altera o próprio perfil; nunca fica sem proprietário ativo.
4. **Imutabilidade:** razão, auditoria, anexos, ajustes e extratos não admitem UPDATE/DELETE/TRUNCATE (gatilhos, valem até para o dono da tabela). Turno fechado só aceita a conferência do gerente. Movimentações/pagamentos só aceitam cancelamento.
5. **Auditoria:** `audit_log` append‑only registra quem, quando e antes/depois (gatilhos automáticos + eventos explícitos). Visível a proprietário/gerente.
6. **Dinheiro:** `bigint` em centavos; entrada do usuário convertida por texto; sem `float`.
7. **Duplicidade:** chave de idempotência por operação + índices únicos; mesmas chaves devolvem o resultado original.
8. **Arquivos:** buckets privados; envio só por proprietário/gerente da mesma empresa (política de Storage); o banco confere se o objeto existe, tipo (PDF/PNG/JPG) e tamanho (≤10 MB) antes de registrar; links assinados de 120 s; anexos registrados não podem ser apagados.
9. **Credenciais:** a chave secreta existe só em variável de servidor; é usada apenas depois que uma função do banco autorizou a ação (criar login, trocar senha, bloquear).
10. **Sessão:** cookies gerenciados pelo `@supabase/ssr`; o `proxy.ts` só faz o redirecionamento otimista — cada página e ação revalida a sessão e o perfil ativo. Cabeçalhos: `X-Frame-Options: DENY`, `nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy`.
11. **Erros:** nunca se mostra “salvo” sem confirmação do banco; falhas de rede mostram mensagem específica e permitem repetir com segurança.
12. **PWA/offline:** o service worker guarda só arquivos estáticos; nenhuma página autenticada ou resposta de API vai para cache; **não há fila offline** (decisão de segurança).

## Testes que comprovam
`tests/db/security.test.ts` (RLS, privilégios, isolamento, perfis, cadastro inicial), `cash.test.ts`, `payables.test.ts`, `finance.test.ts`, `concurrency.test.ts` (conexões simultâneas reais), `contract.test.ts` (o app só grava via RPC e não usa colunas/funções inexistentes), `tests/e2e` (cabeçalhos, redirecionamentos, rotas protegidas).

## Limites dos testes (leia)
- **Fluxo completo contra Supabase real não foi executado.** O ambiente de desenvolvimento não tinha Docker e a execução de um PostgREST baixado foi bloqueada pelo ambiente. Em vez disso: o banco foi testado em PostgreSQL 16 real (todas as migrations); o app foi verificado por teste de contrato contra o schema real e por navegador real contra um servidor de **fixtures fictícias** (que valida renderização e permissões de interface, **não** regras de banco). O Supabase Auth (login real, convite/recuperação por e‑mail), o Storage real e a assinatura de URLs **não foram exercitados**.
- Faça o [roteiro de aceite](ROTEIRO-DE-ACEITE.md) no seu ambiente antes de usar dinheiro real.
- Não houve teste de carga nem revisão de segurança externa. **Recomenda‑se revisão independente** das políticas RLS/funções antes de uso financeiro definitivo.
- `npm audit`: avisos *moderados* em `minimatch` (cadeia do ESLint e da biblioteca de exportação Excel). Não afetam o uso (sem entrada do usuário em padrões glob), mas acompanhe atualizações.

## Fora do escopo / não prometido
Conformidade fiscal ou contábil, emissão de NFC‑e/NF‑e, integração bancária/maquininha, conciliação automática por API, notificações push, fila offline, multiempresa com troca de contexto (o isolamento por empresa existe no banco; a interface atende uma empresa).
