#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing deploy/ubuntu/.env." >&2
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: ./run-collector.sh weekly|floorplans|images|rechecks|popups|doctor" >&2
  exit 1
fi

case "$1" in
  weekly)
    job=(python run_scheduled.py --config /etc/boothhana/collector.json)
    ;;
  floorplans)
    job=(python floorplans.py --config /etc/boothhana/collector.json --imminent)
    ;;
  images)
    job=(python image_repair.py --config /etc/boothhana/collector.json --apply)
    ;;
  rechecks)
    job=(python recheck.py --config /etc/boothhana/collector.json --limit 25)
    ;;
  popups)
    job=(python daily_popups.py --config /etc/boothhana/collector.json)
    ;;
  doctor)
    job=(python doctor.py --config /etc/boothhana/collector.json)
    ;;
  *)
    echo "Unknown job '$1'. Use weekly, floorplans, images, rechecks, popups, or doctor." >&2
    exit 1
    ;;
esac

exec 9>/run/lock/boothhana-collector.lock
if ! flock -n 9; then
  echo "Another BoothHana collector job is already running; skipping duplicate invocation."
  if [[ "$1" == images || "$1" == rechecks || "$1" == popups ]]; then exit 2; fi
  exit 0
fi

api_domain="$(sed -n 's/^API_DOMAIN=//p' .env | tail -n 1 | tr -d '\r')"
if [[ -z "$api_domain" || "$api_domain" == *://* || "$api_domain" == */* ]]; then
  echo "API_DOMAIN in .env must contain only a hostname." >&2
  exit 1
fi

echo "Waiting for BoothHana API readiness..."
for attempt in $(seq 1 24); do
  if curl --fail --silent --show-error --max-time 10 \
      "https://${api_domain}/api/public/health/ready" >/dev/null; then
    break
  fi
  if [[ "$attempt" -eq 24 ]]; then
    echo "API readiness check failed; collector was not started." >&2
    exit 1
  fi
  sleep 5
done

docker compose --env-file .env -f compose.yml --profile jobs run \
  --rm --no-deps -T boothhana-collector "${job[@]}"
