#!/usr/bin/env python3
"""Validate a source-backed event result and import it as a manual batch."""
from __future__ import annotations

import argparse
import calendar
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import uuid

from catalog_rules import parse_schema, validate_discovery
from catalog_transport import Api
from rules import parse_date
from weekly import load_config


def month_bounds(month: str) -> tuple[str, str]:
    year, number = map(int, month.split("-"))
    return date(year, number, 1).isoformat(), date(
        year, number, calendar.monthrange(year, number)[1]
    ).isoformat()


def build_batch(result: dict, month: str | None, blocked_hosts: list[str], start: str | None = None, end: str | None = None) -> dict:
    if month:
        first, last = month_bounds(month)
    elif start and end:
        first, last = parse_date(start).isoformat(), parse_date(end).isoformat()
        if first > last:
            raise ValueError("start must not be after end")
    else:
        raise ValueError("month or start/end range is required")
    accepted, rejected = validate_discovery(
        result, parse_date(first), parse_date(last), blocked_hosts
    )
    if rejected:
        raise ValueError(f"manual event validation rejected rows: {rejected}")
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "schemaVersion": "1",
        "runId": str(uuid.uuid4()),
        "startedAt": now,
        "finishedAt": now,
        "executionMode": "MANUAL_IMPORT",
        "webSearchObserved": False,
        "scope": {
            "region": "SEOUL_GYEONGGI",
            "timezone": "Asia/Seoul",
            "startDate": first,
            "endDate": last,
        },
        "result": {**result, "events": accepted},
    }


def ingest(config_path: Path, input_path: Path, month: str | None, token: str, start: str | None = None, end: str | None = None) -> dict:
    config = load_config(config_path)
    result = parse_schema(input_path.read_bytes(), "event-result-v4.schema.json")
    batch = build_batch(result, month, config["blockedSourceHosts"], start, end)
    return Api(config["apiBaseUrl"], token, config["httpTimeoutSeconds"]).request(
        "POST", "/api/internal/subculture/batches", batch
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    period = parser.add_mutually_exclusive_group(required=True)
    period.add_argument("--month", help="YYYY-MM")
    period.add_argument("--start", help="range start YYYY-MM-DD")
    parser.add_argument("--end", help="range end YYYY-MM-DD; required with --start")
    parser.add_argument("--input", type=Path, required=True)
    args = parser.parse_args()
    if bool(args.start) != bool(args.end):
        parser.error("--start and --end must be provided together")
    config = load_config(args.config)
    token = os.getenv(config["tokenEnv"], "").strip()
    if len(token) < 32:
        parser.error(f"{config['tokenEnv']} must contain the collector token")
    print(json.dumps(ingest(args.config, args.input, args.month, token, args.start, args.end), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
