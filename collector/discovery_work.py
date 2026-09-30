"""Persistent recurring discovery jobs for festival authorities and subculture topics."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import unicodedata

from taxonomy import CATEGORIES


WORK_KINDS = {"FESTIVAL_SOURCE", "SUBCULTURE_RECENT"}
WORK_STATES = {"PENDING", "COMPLETE", "NO_RESULTS", "PARTIAL", "FAILED"}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).strip().casefold()


def work_key(kind: str, subject: str) -> str:
    return hashlib.sha256((kind + "\x1f" + normalize(subject)).encode("utf-8")).hexdigest()


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _write(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    try:
        temporary.chmod(0o600)
    except OSError:
        pass
    os.replace(temporary, path)


def load_profiles(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("schemaVersion") != "1":
        raise ValueError("Discovery profile version mismatch")
    festival = value.get("festival") or {}
    subculture = value.get("subculture") or {}
    if not isinstance(festival.get("officialIndexes"), list):
        raise ValueError("Festival officialIndexes missing")
    for row in festival["officialIndexes"]:
        if not isinstance(row, dict) or not row.get("name") or not row.get("queryTemplates"):
            raise ValueError("Festival official index invalid")
        allowed = row.get("allowedSubcategories")
        if allowed is not None and (not isinstance(allowed, list) or not allowed or any(not isinstance(code, str) or code not in CATEGORIES for code in allowed)):
            raise ValueError("Festival allowed subcategories invalid")
    for key in ("seoulDistricts", "gyeonggiMunicipalities"):
        rows = festival.get(key)
        if not isinstance(rows, list) or not rows or any(not isinstance(row, str) or not row.strip() for row in rows):
            raise ValueError("Festival authority list invalid: " + key)
    groups = subculture.get("searchGroups")
    if not isinstance(groups, list) or not groups:
        raise ValueError("Subculture search groups missing")
    required = {"name", "xQuery", "queryTemplates"}
    if any(not isinstance(row, dict) or not required.issubset(row) or not row["queryTemplates"] for row in groups):
        raise ValueError("Subculture search group invalid")
    for row in groups:
        allowed = row.get("allowedSubcategories")
        if allowed is not None and (not isinstance(allowed, list) or not allowed or any(not isinstance(code, str) or code not in CATEGORIES for code in allowed)):
            raise ValueError("Subculture allowed subcategories invalid")
    return value


def festival_jobs(profile: dict, scope: dict) -> list[dict]:
    value = profile["festival"]
    jobs = []
    for row in value["officialIndexes"]:
        jobs.append({
            "kind": "FESTIVAL_SOURCE", "category": "FESTIVAL", "subject": row["name"],
            "priority": int(row.get("priority", 0)), "cadenceDays": int(row.get("cadenceDays", 7)), "scope": dict(scope),
            "payload": {"sourceType": row["type"], "authority": row["name"], "seeds": row.get("seeds", []),
                        "queryTemplates": row.get("queryTemplates", []), "allowedSubcategories": row.get("allowedSubcategories")},
            "origin": "MUSIC_EVENT_INDEX" if row["type"] == "MUSIC_EVENT_INDEX" else "FESTIVAL_OFFICIAL_INDEX",
        })
    for region, key in (("서울", "seoulDistricts"), ("경기", "gyeonggiMunicipalities")):
        for authority in value[key]:
            jobs.append({
                "kind": "FESTIVAL_SOURCE", "category": "FESTIVAL", "subject": region + ":" + authority,
                "priority": 1, "cadenceDays": 14, "scope": dict(scope),
                "payload": {"sourceType": "LOCAL_AUTHORITY", "authority": authority, "region": region,
                            "seeds": [], "queryTemplates": value["localAuthorityQueryTemplates"]},
                "origin": "FESTIVAL_LOCAL_AUTHORITY",
            })
    return jobs


def subculture_recent_jobs(profile: dict, scope: dict) -> list[dict]:
    jobs = []
    for row in profile["subculture"]["searchGroups"]:
        name = str(row["name"]).strip()
        jobs.append({
            "kind": "SUBCULTURE_RECENT", "category": "SUBCULTURE", "subject": name,
            "priority": int(row.get("priority", 0)), "cadenceDays": int(row.get("cadenceDays", 1)),
            "scope": dict(scope),
            "payload": {"searchGroup": name, "xQuery": row["xQuery"], "recentDays": 7,
                        "queryTemplates": row["queryTemplates"], "seeds": row.get("seeds", []),
                        "allowedSubcategories": row.get("allowedSubcategories")},
            "origin": "SUBCULTURE_RECENT_SEARCH",
        })
    return jobs


class DiscoveryWorkQueue:
    def __init__(self, path: Path):
        self.path = path
        try:
            value = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        except (OSError, json.JSONDecodeError):
            value = {}
        if value.get("schemaVersion") != "1" or not isinstance(value.get("jobs"), dict):
            value = {"schemaVersion": "1", "updatedAt": utcnow(), "jobs": {}}
        self.value = value

    @property
    def jobs(self) -> dict[str, dict]:
        return self.value["jobs"]

    def save(self) -> None:
        self.value["updatedAt"] = utcnow()
        _write(self.path, self.value)

    def enqueue(self, definitions: list[dict]) -> list[dict]:
        rows = []
        for definition in definitions:
            kind = definition["kind"]
            if kind not in WORK_KINDS:
                raise ValueError("Unknown discovery work kind")
            subject = str(definition["subject"]).strip()
            key = work_key(kind, subject)
            item = self.jobs.get(key)
            if item is None:
                item = {
                    "key": key, "kind": kind, "category": definition["category"], "subject": subject,
                    "priority": int(definition.get("priority", 1)), "cadenceDays": int(definition.get("cadenceDays", 14)),
                    "scope": dict(definition["scope"]), "payload": definition.get("payload") or {},
                    "origins": [definition.get("origin") or "UNKNOWN"], "state": "PENDING", "attempts": 0,
                    "createdAt": utcnow(), "lastAttemptAt": None, "nextRunAt": None,
                    "foundEventNames": [], "foundTopics": [], "issues": [],
                }
                self.jobs[key] = item
            else:
                item.update(category=definition["category"], priority=min(int(item.get("priority", 1)),int(definition.get("priority", item.get("priority", 1)))),
                            cadenceDays=int(definition.get("cadenceDays", item.get("cadenceDays", 14))),
                            scope=dict(definition["scope"]), payload=definition.get("payload") or item.get("payload") or {})
                origin = definition.get("origin") or "UNKNOWN"
                if origin not in item.setdefault("origins", []):
                    item["origins"].append(origin)
            rows.append(item)
        if definitions:
            self.save()
        return rows

    def due(self, kind: str, limit: int, now: datetime | None = None) -> list[dict]:
        if kind not in WORK_KINDS:
            raise ValueError("Unknown discovery work kind")
        now = now or datetime.now(timezone.utc)
        rows = []
        for item in self.jobs.values():
            if item.get("kind") != kind:
                continue
            next_run = _parse_time(item.get("nextRunAt"))
            if next_run and next_run > now:
                continue
            rows.append(item)
        rows.sort(key=lambda item: (bool(item.get("lastAttemptAt")), int(item.get("priority", 1)), item.get("lastAttemptAt") or "", item["createdAt"], item["key"]))
        return rows[:limit]

    def begin(self, key: str) -> int:
        item = self.jobs[key]
        item["attempts"] = int(item.get("attempts", 0)) + 1
        item["lastAttemptAt"] = utcnow()
        item["nextRunAt"] = None
        self.save()
        return item["attempts"]

    def finish(self, key: str, state: str, *, retry_hours: int = 24, found_event_names: list[str] | None = None,
               found_topics: list[str] | None = None, issues: list[str] | None = None) -> None:
        if state not in WORK_STATES:
            raise ValueError("Unknown discovery work state")
        item = self.jobs[key]
        item["state"] = state
        item["foundEventNames"] = list(dict.fromkeys(found_event_names or []))[:200]
        item["foundTopics"] = list(dict.fromkeys(found_topics or []))[:200]
        item["issues"] = [str(value)[:300] for value in (issues or [])[:30]]
        delay = retry_hours / 24 if state in {"FAILED", "PARTIAL"} else int(item.get("cadenceDays", 14))
        item["nextRunAt"] = (datetime.now(timezone.utc) + timedelta(days=delay)).isoformat().replace("+00:00", "Z")
        self.save()

    def summary(self) -> dict:
        result = {kind: {state: 0 for state in sorted(WORK_STATES)} for kind in sorted(WORK_KINDS)}
        for item in self.jobs.values():
            kind = item.get("kind")
            state = item.get("state", "FAILED")
            if kind in result:
                result[kind][state] = result[kind].get(state, 0) + 1
        return result
