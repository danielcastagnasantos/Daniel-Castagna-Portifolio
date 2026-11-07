#!/usr/bin/env bash
# Restaura um backup gerado por backup-db.sh em um banco VAZIO (ex.: novo projeto Supabase).
# Uso:  DATABASE_URL='postgresql://...' ./scripts/restore-db.sh backups/2026-03-05_1200
# ATENÇÃO: nunca rode sobre o banco de produção em uso. Restaure em um projeto novo, confira os
# números e só então troque as variáveis do app (veja docs/BACKUP.md).
set -euo pipefail
: "${DATABASE_URL:?Defina DATABASE_URL (banco de DESTINO, vazio)}"
DIR="${1:?Informe a pasta do backup}"
( cd "$DIR" && sha256sum -c SHA256SUMS )
# 1) logins primeiro: profiles.id referencia auth.users (a restauração do public falha sem eles)
if [ -f "$DIR/auth_users.dump" ]; then
  pg_restore --no-owner --no-privileges --data-only --disable-triggers --dbname="$DATABASE_URL" "$DIR/auth_users.dump" || \
    echo "aviso: restauração de auth.users precisa de privilégio elevado (use o SQL Editor/CLI do Supabase)"
fi
# 2) --clean recria os schemas public e private a partir do backup (por isso só use em banco novo/vazio).
pg_restore --no-owner --clean --if-exists --exit-on-error --dbname="$DATABASE_URL" "$DIR/public.dump"
psql "$DATABASE_URL" -q -c "grant usage on schema public to anon, authenticated, service_role; grant usage on schema private to authenticated, service_role"
echo "Restauração concluída. Confira: select count(*) from public.ledger_entries;"
