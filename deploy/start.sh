#!/bin/sh
set -eu

case "${1:-web}" in
  web)
    exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port "${PORT:-3000}"
    ;;
  worker|worker-check)
    export WORKER_ID="${WORKER_ID:-${RAILWAY_REPLICA_ID:-$(hostname)}}"
    if [ "$1" = worker-check ]; then
      exec node --import tsx scripts/worker.ts --check
    fi
    exec node --import tsx scripts/worker.ts
    ;;
  migrate)
    exec node --import tsx scripts/migrate.ts
    ;;
  cleanup)
    exec node --import tsx scripts/cleanup.ts
    ;;
  *)
    printf '%s\n' 'Usage: sh deploy/start.sh web|worker|worker-check|migrate|cleanup' >&2
    exit 2
    ;;
esac
