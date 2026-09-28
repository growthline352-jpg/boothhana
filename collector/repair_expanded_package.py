"""Repair a previously imported expanded-content ZIP without flattening JSON values.

The command is a read-only audit unless ``--apply`` is supplied.  With
``--review-and-publish`` it authenticates as the dedicated administrator before
writing anything, re-imports the canonical participant/sales JSON through the
manual-stage API, reviews only the affected records, and republishes only the
affected events.

Secrets are read from environment variables and are never written to output.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import http.cookiejar
import json
import os
from pathlib import Path, PurePosixPath
import re
import urllib.error
import urllib.request
import uuid
import zipfile

from catalog_rules import parse_schema, validate_stage
from catalog_transport import Api


PARTICIPANT_FILE = re.compile(r"(?P<event>[A-Z]{2}\d{2})_part\d+\.result\.json$")
SALES_FILE = re.compile(r"(?P<event>[A-Z]{2}\d{2})_(?P<research>[0-9a-f]{16})\.result\.json$")


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def compact(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def identity_key(item: dict) -> tuple[str, str, str]:
    identity = item.get("identity") or {}
    return (
        str(identity.get("sourceSystem") or "").rstrip("/"),
        str(identity.get("entryId") or item.get("sourceEntryId") or ""),
        str(identity.get("detailUrl") or "").split("#", 1)[0].rstrip("/"),
    )


@dataclass(frozen=True)
class PackageData:
    events: dict[str, dict]
    participant_index: dict[str, dict]
    participant_files: tuple[tuple[str, str, dict], ...]
    sales_files: tuple[tuple[str, str, str, dict], ...]

    @property
    def participant_count(self) -> int:
        return sum(len(result["participants"]) for _, _, result in self.participant_files)

    def participants_by_event(self) -> dict[str, list[dict]]:
        values: dict[str, list[dict]] = {}
        for event_key, _, result in self.participant_files:
            values.setdefault(event_key, []).extend(result["participants"])
        return values


def _entry_by_suffix(archive: zipfile.ZipFile, suffix: str) -> str:
    matches = [name for name in archive.namelist() if name.endswith(suffix)]
    if len(matches) != 1:
        raise ValueError(f"ZIP entry must match exactly once: {suffix}")
    return matches[0]


def _json_entry(archive: zipfile.ZipFile, name: str) -> object:
    raw = archive.read(name)
    return json.loads(raw.decode("utf-8-sig"))


def load_package(path: Path) -> PackageData:
    with zipfile.ZipFile(path) as archive:
        event_rows = _json_entry(archive, _entry_by_suffix(archive, "/research/event_index.json"))
        participant_rows = _json_entry(archive, _entry_by_suffix(archive, "/research/participant_index.json"))
        events = {row["researchKey"]: row["event"] for row in event_rows}
        participant_index = {row["researchKey"]: row for row in participant_rows}
        participant_files: list[tuple[str, str, dict]] = []
        sales_files: list[tuple[str, str, str, dict]] = []
        for name in sorted(archive.namelist()):
            leaf = PurePosixPath(name).name
            participant = PARTICIPANT_FILE.fullmatch(leaf)
            if participant and "/data/participants/" in name:
                raw = archive.read(name)
                result = parse_schema(raw, "stage-result-v5.schema.json")
                event_key = participant.group("event")
                validate_stage(result, "PARTICIPANTS", events[event_key], [])
                participant_files.append((event_key, name, result))
                continue
            sales = SALES_FILE.fullmatch(leaf)
            if sales and "/data/sales/" in name:
                raw = archive.read(name)
                result = parse_schema(raw, "stage-result-v5.schema.json")
                event_key = sales.group("event")
                research_key = sales.group("research")
                if research_key not in participant_index:
                    raise ValueError(f"Sales participant is absent from participant_index: {leaf}")
                if participant_index[research_key]["eventKey"] != event_key:
                    raise ValueError(f"Sales event binding disagrees with participant_index: {leaf}")
                validate_stage(result, "SALES", events[event_key], [])
                sales_files.append((event_key, research_key, name, result))
    return PackageData(events, participant_index, tuple(participant_files), tuple(sales_files))


class AdminApi:
    def __init__(self, base: str, timeout: int = 45):
        self.base = base.rstrip("/")
        self.timeout = timeout
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
        self.csrf = ""

    def request(self, method: str, path: str, data: object | None = None) -> object | None:
        if not (path.startswith("/api/auth/") or path.startswith("/api/admin/subculture/v4/")):
            raise ValueError("Unapproved administrator API path")
        headers = {"Accept": "application/json", "User-Agent": "BoothHana-Repair/1"}
        body = None
        if data is not None:
            body = compact(data)
            headers["Content-Type"] = "application/json"
        if method not in {"GET", "HEAD", "OPTIONS"}:
            headers["X-XSRF-TOKEN"] = self.csrf
        request = urllib.request.Request(self.base + path, method=method, data=body, headers=headers)
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                raw = response.read(10 * 1024 * 1024 + 1)
                if len(raw) > 10 * 1024 * 1024:
                    raise RuntimeError("Administrator response exceeds 10 MiB")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            status = exc.code
            exc.close()
            raise RuntimeError(f"Administrator API returned HTTP {status}") from None

    def login(self, username: str, password: str) -> None:
        token = self.request("GET", "/api/auth/csrf")
        if not isinstance(token, dict) or not token.get("token"):
            raise RuntimeError("Administrator CSRF token was not returned")
        self.csrf = str(token["token"])
        self.request("POST", "/api/auth/admin/login", {"username": username, "password": password})


def match_event_targets(package: PackageData, targets: list[dict]) -> dict[str, dict]:
    by_name: dict[str, list[dict]] = {}
    for target in targets:
        by_name.setdefault(target["event"]["name"].strip(), []).append(target)
    matched: dict[str, dict] = {}
    needed = {event_key for event_key, _, _ in package.participant_files}
    for event_key in needed:
        candidates = by_name.get(package.events[event_key]["name"].strip(), [])
        if len(candidates) != 1:
            raise RuntimeError(f"Expected one live event for {event_key}; found {len(candidates)}")
        matched[event_key] = candidates[0]
    return matched


def match_sales_targets(package: PackageData, event_targets: dict[str, dict], targets: list[dict]) -> dict[str, dict]:
    live: dict[tuple[int, tuple[str, str, str]], dict] = {}
    for target in targets:
        live[(int(target["eventId"]), identity_key(target["participant"]))] = target
    matched: dict[str, dict] = {}
    for event_key, research_key, _, _ in package.sales_files:
        event_id = int(event_targets[event_key]["id"])
        participant = package.participant_index[research_key]["participant"]
        target = live.get((event_id, identity_key(participant)))
        if target is None:
            raise RuntimeError(f"Live participant was not found for sales record {event_key}/{research_key}")
        matched[research_key] = target
    return matched


def review_and_publish(admin: AdminApi, participant_ids: set[int], sales_ids: set[int], event_ids: set[int]) -> dict:
    reviewed_participants = 0
    reviewed_sales = 0
    for participant_id in sorted(participant_ids):
        view = admin.request("GET", f"/api/admin/subculture/v4/participants/{participant_id}")
        admin.request("PATCH", f"/api/admin/subculture/v4/participants/{participant_id}", {
            "revision": int(view["revision"]), "reviewState": "REVIEWED",
            "note": "원본 확장수집 JSON 구조 보정", "overrides": {}, "clearOverrides": [],
        })
        reviewed_participants += 1
        if participant_id in sales_ids:
            view = admin.request("GET", f"/api/admin/subculture/v4/participants/{participant_id}")
            sales = view.get("sales")
            if sales is None:
                raise RuntimeError(f"Sales row disappeared for participant {participant_id}")
            admin.request("PATCH", f"/api/admin/subculture/v4/participants/{participant_id}/sales", {
                "revision": int(sales["revision"]), "reviewState": "REVIEWED",
                "note": "원본 확장수집 JSON 구조 보정", "overrides": {}, "clearOverrides": [],
            })
            reviewed_sales += 1
    published = 0
    for event_id in sorted(event_ids):
        event = admin.request("GET", f"/api/admin/subculture/v4/events/{event_id}")
        if event.get("reviewState") != "REVIEWED":
            raise RuntimeError(f"Event {event_id} must remain REVIEWED before republishing")
        admin.request("POST", f"/api/admin/subculture/v4/events/{event_id}/publish", {
            "eventRevision": int(event["revision"]),
        })
        published += 1
    return {"reviewedParticipants": reviewed_participants, "reviewedSales": reviewed_sales, "publishedEvents": published}


PARTICIPANT_OVERRIDE_FIELDS = ("registrationName", "kind", "members", "locations", "subjects", "description", "officialLinks", "warnings")
SALES_OVERRIDE_FIELDS = ("summary", "evidenceScope", "categories", "subjects", "salesMethod", "products", "warnings")


def selected_fields(value: dict, fields: tuple[str, ...]) -> dict:
    missing = [field for field in fields if field not in value]
    if missing:
        raise ValueError("Canonical record is missing fields: " + ", ".join(missing))
    return {field: value[field] for field in fields}


def admin_event_rows(admin: AdminApi) -> list[dict]:
    first = admin.request("GET", "/api/admin/subculture/v4/events?page=0&size=100")
    if int(first["total"]) > 100:
        raise RuntimeError("Administrator event repair currently supports at most 100 events")
    return list(first["items"])


def admin_participant_rows(admin: AdminApi, event_id: int) -> list[dict]:
    rows: list[dict] = []
    page = 0
    while True:
        result = admin.request("GET", f"/api/admin/subculture/v4/events/{event_id}/participants?page={page}&size=100")
        rows.extend(result["items"])
        if len(rows) >= int(result["total"]):
            return rows
        page += 1


def repair_with_admin_overrides(package: PackageData, admin: AdminApi) -> dict:
    """Repair reviewed/public JSON immediately when the collector token is unavailable.

    This path deliberately touches only fields the administrator API allows. Stable
    identities and source evidence remain server-owned, while every nested list and
    product/price object is replaced from the canonical ZIP.
    """
    event_rows = admin_event_rows(admin)
    by_name: dict[str, list[dict]] = {}
    for row in event_rows:
        by_name.setdefault(row["name"].strip(), []).append(row)
    event_ids: dict[str, int] = {}
    for event_key in package.participants_by_event():
        matches = by_name.get(package.events[event_key]["name"].strip(), [])
        if len(matches) != 1:
            raise RuntimeError(f"Expected one administrator event for {event_key}; found {len(matches)}")
        event_ids[event_key] = int(matches[0]["id"])

    live_by_identity: dict[tuple[str, tuple[str, str, str]], dict] = {}
    for event_key, event_id in event_ids.items():
        for row in admin_participant_rows(admin, event_id):
            live_by_identity[(event_key, identity_key(row["data"]))] = row

    participant_ids: dict[str, int] = {}
    repaired_participants = 0
    for event_key, participants in package.participants_by_event().items():
        for canonical in participants:
            row = live_by_identity.get((event_key, identity_key(canonical)))
            if row is None:
                raise RuntimeError(f"Administrator participant not found: {event_key}/{canonical['registrationName']}")
            admin.request("PATCH", f"/api/admin/subculture/v4/participants/{row['id']}", {
                "revision": int(row["revision"]), "reviewState": "REVIEWED",
                "note": "원본 확장수집 JSON 구조 보정", "overrides": selected_fields(canonical, PARTICIPANT_OVERRIDE_FIELDS),
                "clearOverrides": [],
            })
            repaired_participants += 1
            key = next((research for research, indexed in package.participant_index.items()
                        if indexed["eventKey"] == event_key and identity_key(indexed["participant"]) == identity_key(canonical)), None)
            if key:
                participant_ids[key] = int(row["id"])

    repaired_sales = 0
    for event_key, research_key, _, result in package.sales_files:
        participant_id = participant_ids.get(research_key)
        if participant_id is None:
            raise RuntimeError(f"Administrator sales participant not bound: {event_key}/{research_key}")
        canonical = result["sales"]
        if canonical is None:
            continue
        row = admin.request("GET", f"/api/admin/subculture/v4/participants/{participant_id}")
        if row.get("sales") is None:
            raise RuntimeError(f"Administrator sales row is absent for participant {participant_id}")
        admin.request("PATCH", f"/api/admin/subculture/v4/participants/{participant_id}/sales", {
            "revision": int(row["sales"]["revision"]), "reviewState": "REVIEWED",
            "note": "원본 확장수집 JSON 구조 보정", "overrides": selected_fields(canonical, SALES_OVERRIDE_FIELDS),
            "clearOverrides": [],
        })
        repaired_sales += 1

    for event_id in sorted(event_ids.values()):
        event = admin.request("GET", f"/api/admin/subculture/v4/events/{event_id}")
        if event.get("reviewState") != "REVIEWED":
            raise RuntimeError(f"Event {event_id} must be REVIEWED before republishing")
        admin.request("POST", f"/api/admin/subculture/v4/events/{event_id}/publish", {"eventRevision": int(event["revision"])})
    return {"repairedParticipants": repaired_participants, "repairedSales": repaired_sales, "publishedEvents": len(event_ids)}


def apply_package(package: PackageData, api_base: str, token: str, admin: AdminApi | None) -> dict:
    api = Api(api_base, token)
    pipeline_id = str(uuid.uuid4())
    api.request("POST", "/api/internal/subculture/v4/pipelines", {
        "runId": pipeline_id,
        "weekKey": datetime.now(timezone.utc).date().isoformat(),
        "scope": {"region": "SEOUL_GYEONGGI", "timezone": "Asia/Seoul", "startDate": "2026-09-01", "endDate": "2026-10-31"},
    })
    receipts: list[dict] = []
    affected_participants: set[int] = set()
    affected_sales: set[int] = set()
    affected_events: set[int] = set()
    try:
        event_targets = match_event_targets(package, api.request("GET", f"/api/internal/subculture/v4/pipelines/{pipeline_id}/events?limit=200"))
        for event_key, path, result in package.participant_files:
            target = event_targets[event_key]
            run_id = str(uuid.uuid5(uuid.UUID(pipeline_id), path))
            began = utcnow()
            receipt = api.request("POST", "/api/internal/subculture/v4/manual-stages", {
                "schemaVersion": "4", "runId": run_id, "pipelineId": pipeline_id,
                "stage": "PARTICIPANTS", "eventId": int(target["id"]), "participantId": None,
                "targetRevision": int(target["revision"]), "startedAt": began, "finishedAt": utcnow(),
                "webSearchObserved": False, "result": result, "cursor": None,
            })
            if int(receipt.get("rejected", 0)):
                raise RuntimeError(f"Participant repair rejected rows from {PurePosixPath(path).name}")
            ids = {int(value) for value in receipt.get("participantIds", [])}
            if len(ids) != len(result["participants"]):
                raise RuntimeError(f"Participant repair did not bind every row from {PurePosixPath(path).name}")
            affected_participants.update(ids)
            affected_events.add(int(target["id"]))
            receipts.append(receipt)

        live_participants = api.request("GET", f"/api/internal/subculture/v4/pipelines/{pipeline_id}/participants?limit=1000")
        sales_targets = match_sales_targets(package, event_targets, live_participants)
        for event_key, research_key, path, result in package.sales_files:
            event = event_targets[event_key]
            participant = sales_targets[research_key]
            run_id = str(uuid.uuid5(uuid.UUID(pipeline_id), path))
            began = utcnow()
            receipt = api.request("POST", "/api/internal/subculture/v4/manual-stages", {
                "schemaVersion": "4", "runId": run_id, "pipelineId": pipeline_id,
                "stage": "SALES", "eventId": int(event["id"]), "participantId": int(participant["id"]),
                "targetRevision": int(participant["revision"]), "startedAt": began, "finishedAt": utcnow(),
                "webSearchObserved": False, "result": result, "cursor": None,
            })
            if int(receipt.get("rejected", 0)):
                raise RuntimeError(f"Sales repair rejected rows from {PurePosixPath(path).name}")
            affected_sales.add(int(participant["id"]))
            receipts.append(receipt)

        review = review_and_publish(admin, affected_participants, affected_sales, affected_events) if admin else {}
        api.request("POST", f"/api/internal/subculture/v4/pipelines/{pipeline_id}/finish", {
            "state": "SUCCESS", "summary": {"expandedPackageRepair": True, **review},
        })
        return {
            "pipelineId": pipeline_id, "participantFiles": len(package.participant_files),
            "salesFiles": len(package.sales_files), "participantRows": len(affected_participants),
            "salesRows": len(affected_sales), "events": len(affected_events), **review,
        }
    except Exception:
        try:
            api.request("POST", f"/api/internal/subculture/v4/pipelines/{pipeline_id}/finish", {
                "state": "FAILED", "summary": {"expandedPackageRepair": True, "receiptsCompleted": len(receipts)},
            })
        except Exception:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip", type=Path)
    parser.add_argument("--api-base", default="https://boothhana2-api-zn7x.onrender.com")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--review-and-publish", action="store_true")
    parser.add_argument("--admin-overrides-only", action="store_true",
                        help="repair reviewed/public records with the admin API; does not require the collector token")
    parser.add_argument("--token-env", default="BOOTH_COLLECTOR_TOKEN")
    parser.add_argument("--admin-username-env", default="BOOTH_ADMIN_USERNAME")
    parser.add_argument("--admin-password-env", default="BOOTH_ADMIN_PASSWORD")
    args = parser.parse_args()
    package = load_package(args.zip)
    audit = {
        "eventRecords": len(package.events), "participantFiles": len(package.participant_files),
        "participantRows": package.participant_count, "salesFiles": len(package.sales_files),
        "affectedEventKeys": sorted({key for key, _, _ in package.participant_files}),
        "structuredJsonPreserved": True,
    }
    if not args.apply and not args.admin_overrides_only:
        print(json.dumps(audit, ensure_ascii=False, indent=2))
        return 0
    admin = None
    if args.review_and_publish or args.admin_overrides_only:
        username = os.environ.get(args.admin_username_env, "")
        password = os.environ.get(args.admin_password_env, "")
        if not username or not password:
            raise SystemExit("Administrator credential environment variables are required")
        admin = AdminApi(args.api_base)
        admin.login(username, password)  # Authenticate before the first data mutation.
    if args.admin_overrides_only:
        print(json.dumps(repair_with_admin_overrides(package, admin), ensure_ascii=False, indent=2))
        return 0
    token = os.environ.get(args.token_env, "")
    if len(token) < 32:
        raise SystemExit(f"{args.token_env} must contain the collector token")
    print(json.dumps(apply_package(package, args.api_base, token, admin), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
