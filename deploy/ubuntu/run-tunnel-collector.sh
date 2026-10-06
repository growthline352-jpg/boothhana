#!/usr/bin/env bash
# Intended for the dedicated, unprivileged deployment user's cron.
set -Eeuo pipefail
RUNTIME_DIR="${BOOTHHANA_RUNTIME_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)}"
cd "$RUNTIME_DIR"
umask 077
mkdir -p logs
case "${1:-}" in
  weekly) job=(python run_scheduled.py --config /etc/boothhana/collector.json); limit=22h ;;
  floorplans) job=(python floorplans.py --config /etc/boothhana/collector.json --imminent); limit=12h ;;
  images) job=(python repair_all.py --config /etc/boothhana/collector.json --apply); limit=none ;;
  images-store) job=(python image_repair.py --config /etc/boothhana/collector.json --apply --store-only --drain --max-minutes 0); limit=none ;;
  popups) job=(python daily_popups.py --config /etc/boothhana/collector.json); limit=100m ;;
  discovery) job=(python daily_popups.py --config /etc/boothhana/collector.json --regional-only); limit=100m ;;
  popup-inventory) job=(python daily_popups.py --config /etc/boothhana/collector.json --official-only); limit=25m ;;
  doctor) job=(python doctor.py --config /etc/boothhana/collector.json --coverage); limit=3m ;;
  *) echo 'Usage: run-tunnel-collector.sh weekly|floorplans|images|images-store|popups|discovery|popup-inventory|doctor' >&2; exit 1 ;;
esac
exec 9>collector.lock
if ! flock -w 900 9; then
  # No queue item is consumed by a lock conflict. The next scheduled cycle reads
  # persistent due jobs first; distinguish deferral from successful collection.
  printf '%s %s 2 DEFERRED_LOCK\n' "$(date --iso-8601=seconds)" "$1" >"logs/$1.status"
  exit 2
fi
log="logs/$(date +%Y%m%d-%H%M%S)-$1.log"
exec >>"$log" 2>&1
echo "START $(date --iso-8601=seconds) $1"
docker compose exec -T boothhana-api curl --fail --silent --show-error --max-time 15 http://127.0.0.1:8080/api/public/health/ready
if [[ "$1" != images && "$1" != images-store && "$1" != popup-inventory && "$1" != doctor ]]; then
  docker compose run --rm --no-deps -T boothhana-collector codex login status
fi
set +e
if [[ "$limit" == none ]]; then
  docker compose run --rm --no-deps -T boothhana-collector "${job[@]}" </dev/null
else
  timeout --signal=TERM --kill-after=60s "$limit" docker compose run --rm --no-deps -T boothhana-collector "${job[@]}" </dev/null
fi
result=$?
set -e
echo "END $(date --iso-8601=seconds) exit=$result"
printf '%s %s %s\n' "$(date --iso-8601=seconds)" "$1" "$result" > "logs/$1.status"
exit "$result"
