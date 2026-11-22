#!/bin/sh
# Restores a backup INTO THE RUNNING DATABASE, replacing its contents:  scripts/restore.sh backups/pz_2026-11-17_0300.dump
set -eu
[ $# -eq 1 ] && [ -f "$1" ] || { echo "usage: $0 <backup.dump>"; exit 1; }
printf 'This replaces ALL current data. Type "yes" to continue: '
read -r answer
[ "$answer" = "yes" ] || { echo "cancelled"; exit 1; }
docker compose stop api web
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$1"
docker compose start api web
echo "restored from $1"
