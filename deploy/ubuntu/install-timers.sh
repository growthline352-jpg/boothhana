#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$EUID" -ne 0 ]]; then
  echo "Run with sudo: sudo ./install-timers.sh" >&2
  exit 1
fi

expected="/opt/boothhana/deploy/ubuntu"
if [[ "$SCRIPT_DIR" != "$expected" ]]; then
  echo "Timers expect the repository at /opt/boothhana (current: $SCRIPT_DIR)." >&2
  exit 1
fi

install -m 0644 "$SCRIPT_DIR"/systemd/*.service "$SCRIPT_DIR"/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now boothhana-collector-weekly.timer boothhana-floorplans.timer boothhana-images.timer
systemctl list-timers --all boothhana-collector-weekly.timer boothhana-floorplans.timer boothhana-images.timer
