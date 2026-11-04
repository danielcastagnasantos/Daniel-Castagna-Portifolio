#!/usr/bin/env bash
# Backup lógico do Caixa Central (complementa os backups automáticos do Supabase).
# Gera, em ./backups/AAAA-MM-DD_HHMM/:
#   public.dump     schemas `public` e `private` COMPLETOS (tabelas, funções, políticas RLS, gatilhos) + todos os dados
#   auth_users.dump dados de auth.users e auth.identities (logins/senhas com hash)
#   SHA256SUMS      somas de verificação
# Uso:  DATABASE_URL='postgresql://postgres:...@db.xxxx.supabase.co:5432/postgres' ./scripts/backup-db.sh
# Use a conexão DIRETA (porta 5432), não o pooler. Guarde os arquivos FORA do computador da loja,
# em local privado e criptografado (contêm dados financeiros e hashes de senha).
set -euo pipefail
: "${DATABASE_URL:?Defina DATABASE_URL (conexão direta do banco)}"
OUT="${BACKUP_DIR:-./backups}/$(date +%Y-%m-%d_%H%M)"
mkdir -p "$OUT"
pg_dump --format=custom --no-owner --schema=public --schema=private --file="$OUT/public.dump" "$DATABASE_URL"
pg_dump --format=custom --no-owner --no-privileges --data-only --table=auth.users --table=auth.identities \
  --file="$OUT/auth_users.dump" "$DATABASE_URL" 2>/dev/null || echo "aviso: auth.identities ausente; seguindo só com auth.users"
( cd "$OUT" && sha256sum *.dump > SHA256SUMS )
echo "Backup salvo em $OUT"
ls -lh "$OUT"
