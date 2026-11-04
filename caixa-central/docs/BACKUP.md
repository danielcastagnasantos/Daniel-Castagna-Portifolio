# Backup, recuperação e retenção

## Política recomendada
| Camada | O quê | Frequência | Retenção | Onde |
|---|---|---|---|---|
| 1. Supabase gerenciado | Banco inteiro | Diário (plano Pro) · **PITR** opcional | 7+ dias (Pro) | Supabase |
| 2. Dump lógico (`scripts/backup-db.sh`) | Schemas `public`+`private` e logins | **Semanal** e antes de qualquer mudança grande | 12 meses (mensal), 8 semanas (semanal) | **Fora** do computador da loja, criptografado |
| 3. Arquivos | Boletos e comprovantes (Storage) | Mensal | 5 anos* | Pasta/nuvem privada |
| 4. Relatórios | Fechamento mensal em PDF + extratos do banco | Todo mês | 5 anos* | Pasta/nuvem privada |

\* Ajuste o prazo com seu contador; este projeto não define obrigações fiscais.

**Metas:** perder no máximo 1 dia de dados (RPO ≈ 24 h; com PITR, minutos) e voltar a operar em até 1 dia útil (RTO).

## Fazer o dump lógico
Precisa de `pg_dump` (PostgreSQL client 15+) e da **conexão direta** (Project Settings > Database > Connection string, porta 5432):
```bash
DATABASE_URL='postgresql://postgres:SENHA@db.SEU_REF.supabase.co:5432/postgres' ./scripts/backup-db.sh
```
Cria `backups/AAAA-MM-DD_HHMM/` com `public.dump`, `auth_users.dump` e `SHA256SUMS`. Os arquivos contêm dados financeiros e hashes de senha: **criptografe** (ex.: `gpg -c`) e guarde fora da loja.

**Arquivos do Storage:** baixe periodicamente pelo painel (Storage > boletos/comprovantes) ou com `supabase storage cp -r ss:///boletos ./backups/storage/boletos --experimental`. O caminho do arquivo está registrado em `bill_files`, então o banco sabe a quem cada arquivo pertence.

## Recuperar (desastre)
**Sempre restaure em um projeto Supabase NOVO**, nunca por cima do que está em uso:
1. Crie um projeto novo (vazio). **Não** aplique migrations nele — o dump já traz o schema completo.
2. Restaure:
   ```bash
   DATABASE_URL='postgresql://postgres:SENHA@db.NOVO_REF.supabase.co:5432/postgres' ./scripts/restore-db.sh backups/AAAA-MM-DD_HHMM
   ```
   O script confere os checksums, restaura primeiro os logins e depois o schema/dados, e reaplica as permissões de schema.
   Se a restauração de `auth.users` for recusada por falta de privilégio, rode o dump `auth_users.dump` pelo SQL Editor/CLI com a role `postgres`.
3. **Confira** (SQL Editor): `select count(*) from ledger_entries;`, `select sum(amount_cents) from ledger_entries;` e compare com o último relatório/backup; abra o app apontando para o projeto novo e verifique o Painel.
4. Recarregue os arquivos do Storage (os buckets são criados pela migration já incluída no dump; reenvie os arquivos nos mesmos caminhos).
5. Troque `NEXT_PUBLIC_SUPABASE_URL`/chaves na Vercel e refaça o deploy. Reconfigure Auth (desativar cadastro público, SMTP, templates, URLs) conforme [PRODUCAO.md](PRODUCAO.md).

## O que foi testado
O ciclo **dump → restauração em banco novo** foi executado em PostgreSQL local com o seed de desenvolvimento: ao final, o destino tinha os mesmos totais (lançamentos, turnos, boletos, auditoria, saldo do razão), as 22 políticas RLS, os logins, as proteções de imutabilidade (tentar `DELETE` no razão falha) e as permissões (visitante sem execução; navegador sem escrita direta). **Não foi testado contra um projeto Supabase real** — faça um teste de restauração antes de depender disto e repita a cada trimestre.

## Teste de restauração (faça uma vez por trimestre)
Restaure o dump mais recente num projeto de teste, confira os totais acima e apague o projeto de teste. Backup que nunca foi restaurado não é backup.
