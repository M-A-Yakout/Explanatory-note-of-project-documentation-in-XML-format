#!/bin/sh
# Database backup (custom format, restorable with pg_restore). Run from the repository root; schedule with cron.
set -eu
mkdir -p backups
FILE="backups/pz_$(date +%Y-%m-%d_%H%M).dump"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$FILE"
echo "saved $FILE ($(wc -c < "$FILE") bytes)"
# keep the 14 most recent
ls -1t backups/pz_*.dump | tail -n +15 | xargs -r rm --
