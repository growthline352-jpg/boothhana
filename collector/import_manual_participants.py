"""Import a reviewed, local TSV roster through the audited manual-stage API.

The command is inert unless ``--apply`` is supplied. It never marks the result as
CLI web-search output and leaves every inserted participant pending for admin review.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import uuid

from catalog_transport import Api


def roster(path: Path, source_url: str, start_date: str, end_date: str) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream, delimiter="\t"):
            code = row["booth"].strip().upper()
            name = row["name"].strip()
            category = row["category"].strip()
            rows.append({
                "sourceEntryId": f"jipconomy-2026:{code}",
                "registrationName": name,
                "kind": row["kind"].strip(),
                "members": [],
                "locations": [{
                    "code": code,
                    "status": "ASSIGNED",
                    "hall": "D홀",
                    "zone": category,
                    "startDate": start_date,
                    "endDate": end_date,
                    "floorPlanUrl": source_url,
                }],
                "subjects": [category, "부동산"],
                "officialLinks": [source_url],
                "sources": [{
                    "url": source_url,
                    "kind": "OFFICIAL",
                    "access": "ORIGINAL",
                    "evidence": f"공식 2026 참가기업표에서 {code}와 {name}, 공식 배치도에서 위치를 대조했습니다.",
                }],
                "images": [],
                "warnings": ["2026-09-27 공식 참가기업표·배치도 기준이며 행사 당일 변경될 수 있습니다."],
                "identity": {
                    "sourceSystem": "https://jipconomy.kr",
                    "entryId": f"jipconomy-2026:{code}",
                    "detailUrl": source_url,
                },
            })
    return rows


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-base", default="https://boothhana2-api-zn7x.onrender.com")
    parser.add_argument("--event-id", type=int, required=True)
    parser.add_argument("--start-date", required=True)
    parser.add_argument("--end-date", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--tsv", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    participants = roster(args.tsv, args.source_url, args.start_date, args.end_date)
    preview = {"eventId": args.event_id, "participants": len(participants), "booths": [p["locations"][0]["code"] for p in participants]}
    if not args.apply:
        print(json.dumps(preview, ensure_ascii=False, indent=2))
        return 0

    token = os.environ.get("BOOTH_COLLECTOR_TOKEN", "")
    api = Api(args.api_base, token)
    pipeline_id = str(uuid.uuid4())
    week_key = args.start_date
    scope = {"region": "SEOUL_GYEONGGI", "timezone": "Asia/Seoul", "startDate": args.start_date, "endDate": args.end_date}
    api.request("POST", "/api/internal/subculture/v4/pipelines", {"runId": pipeline_id, "weekKey": week_key, "scope": scope})
    targets = api.request("GET", f"/api/internal/subculture/v4/pipelines/{pipeline_id}/events?limit=200")
    target = next((item for item in targets if int(item["id"]) == args.event_id), None)
    if target is None:
        raise RuntimeError("Event is outside the pipeline scope or not available for import")
    began = utcnow()
    run_id = str(uuid.uuid5(uuid.UUID(pipeline_id), f"manual-participants:{args.event_id}:{args.source_url}"))
    result = {
        "searchStatus": "COMPLETE",
        "summary": f"관리자가 확인한 공식 참가기업표와 배치도에서 {len(participants)}개 위치를 수동 수입합니다.",
        "queries": [args.source_url],
        "coverage": {
            "completeness": "COMPLETE",
            "reportedTotal": len(participants),
            "totalUnit": "REGISTERED_BOOTHS",
            "visitedPages": [args.source_url],
            "nextPageUrl": None,
            "warnings": ["수동 웹 조사 결과이며 CLI 검색 관측으로 표시하지 않습니다."],
        },
        "participants": participants,
        "sales": None,
    }
    receipt = api.request("POST", "/api/internal/subculture/v4/manual-stages", {
        "schemaVersion": "4",
        "runId": run_id,
        "pipelineId": pipeline_id,
        "stage": "PARTICIPANTS",
        "eventId": args.event_id,
        "participantId": None,
        "targetRevision": int(target["revision"]),
        "startedAt": began,
        "finishedAt": utcnow(),
        "webSearchObserved": False,
        "result": result,
        "cursor": None,
    })
    api.request("POST", f"/api/internal/subculture/v4/pipelines/{pipeline_id}/finish", {
        "state": "PARTIAL" if receipt.get("issues") else "SUCCESS",
        "summary": {"manualImport": True, "eventId": args.event_id, "receipt": receipt},
    })
    print(json.dumps({"pipelineId": pipeline_id, "receipt": receipt}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
