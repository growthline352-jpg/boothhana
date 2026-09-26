#!/usr/bin/env python3
"""Review source-backed monthly catalogue rows and refresh the public snapshot.

The default is a read-only preview. Participant sales stay pending because a
monthly catalogue review cannot prove that every product or price is current.
"""
from __future__ import annotations

import argparse
import calendar
import json
import os
from datetime import date

from backfill_public_media import API_DEFAULT, AdminApi


def pages(api: AdminApi, path: str) -> list[dict]:
    items: list[dict] = []
    page = 0
    while True:
        value = api.request("GET", f"{path}{'&' if '?' in path else '?'}page={page}&size=100")
        items.extend(value["items"])
        if len(items) >= value["total"]:
            return items
        page += 1


def month_bounds(month: str) -> tuple[str, str]:
    year, number = map(int, month.split("-"))
    return date(year, number, 1).isoformat(), date(year, number, calendar.monthrange(year, number)[1]).isoformat()


def overlaps(event: dict, first: str, last: str) -> bool:
    return any(row["endDate"] >= first and row["startDate"] <= last for row in event.get("occurrences", []))


def source_backed(event: dict) -> bool:
    return any(source.get("access") == "ORIGINAL" and source.get("kind") in {"OFFICIAL", "VENUE", "ORGANIZER_SOCIAL"}
               for source in event.get("sources", []))


def run(api: AdminApi, month: str, apply: bool) -> dict:
    first, last = month_bounds(month)
    candidates = []
    for row in pages(api, "/api/admin/subculture/v4/events?"):
        detail = api.event(int(row["id"]))
        if overlaps(detail["event"], first, last):
            candidates.append(detail)
    result = {"month": month, "matched": len(candidates), "reviewedEvents": 0,
              "reviewedParticipants": 0, "publishedEvents": 0, "events": [], "skipped": []}
    for detail in candidates:
        event_id = int(detail["id"])
        if detail["reviewState"] == "EXCLUDED" or not source_backed(detail["event"]) or detail.get("possibleDuplicateOf") is not None:
            reason = "possible-duplicate" if detail.get("possibleDuplicateOf") is not None else "excluded-or-no-original-source"
            result["skipped"].append({"eventId": event_id, "name": detail["event"]["name"], "reason": reason})
            continue
        participants = api.participants(event_id)
        result["events"].append({"eventId": event_id, "name": detail["event"]["name"],
                                 "reviewState": detail["reviewState"], "participants": len(participants)})
        if not apply:
            result["reviewedEvents"] += detail["reviewState"] != "REVIEWED"
            result["reviewedParticipants"] += sum(row["reviewState"] == "PENDING" for row in participants)
            result["publishedEvents"] += 1
            continue
        if detail["reviewState"] != "REVIEWED":
            detail = api.request("PATCH", f"/api/admin/subculture/v4/events/{event_id}", {
                "revision": int(detail["revision"]), "reviewState": "REVIEWED",
                "note": f"{month} 공식 원문 기반 월간 수집 검토", "overrides": {}, "clearOverrides": [],
            })
            result["reviewedEvents"] += 1
        for participant in participants:
            if participant["reviewState"] != "PENDING":
                continue
            api.request("PATCH", f"/api/admin/subculture/v4/participants/{participant['id']}", {
                "revision": int(participant["revision"]), "reviewState": "REVIEWED",
                "note": f"{month} 공식 참가명단 원문 기반 검토", "overrides": {}, "clearOverrides": [],
            })
            result["reviewedParticipants"] += 1
        api.publish(event_id)
        result["publishedEvents"] += 1
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--month", required=True, help="YYYY-MM")
    parser.add_argument("--api", default=API_DEFAULT)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    username = os.getenv("ADMIN_LOGIN_USERNAME", "")
    password = os.getenv("ADMIN_LOGIN_PASSWORD", "")
    if not username or not password:
        parser.error("ADMIN_LOGIN_USERNAME and ADMIN_LOGIN_PASSWORD are required")
    summary = run(AdminApi(args.api, username, password), args.month, args.apply)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
