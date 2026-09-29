#!/usr/bin/env bash
# Intended for the dedicated, unprivileged deployment user's cron.
set -Eeuo pipefail
RUNTIME_DIR="${BOOTHHANA_RUNTIME_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)}"
cd "$RUNTIME_DIR"
umask 077
mkdir -p logs
exec 9>collector.lock
flock -n 9 || exit 0
case "${1:-}" in
  weekly) job=(python run_scheduled.py --config /etc/boothhana/collector.json); limit=22h ;;
  floorplans) job=(python floorplans.py --config /etc/boothhana/collector.json --imminent); limit=12h ;;
  doctor) job=(python doctor.py --config /etc/boothhana/collector.json); limit=3m ;;
  *) echo 'Usage: run-tunnel-collector.sh weekly|floorplans|doctor' >&2; exit 1 ;;
esac
log="logs/$(date +%Y%m%d-%H%M%S)-$1.log"
exec >>"$log" 2>&1
echo "START $(date --iso-8601=seconds) $1"
docker compose exec -T boothhana-api curl --fail --silent --show-error --max-time 15 http://127.0.0.1:8080/api/public/health/ready
docker compose run --rm --no-deps -T boothhana-collector codex login status
set +e
timeout --signal=TERM --kill-after=60s "$limit" docker compose run --rm --no-deps -T boothhana-collector "${job[@]}" </dev/null
result=$?
set -e
echo "END $(date --iso-8601=seconds) exit=$result"
printf '%s %s %s\n' "$(date --iso-8601=seconds)" "$1" "$result" > "logs/$1.status"
exit "$result"
