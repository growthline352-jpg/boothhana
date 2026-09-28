"""Durable per-event-name research queue shared by catalogue stages.

The queue is deliberately local to the collector host. It contains research
bookkeeping and source URLs, never credentials. Database staging remains the
server's responsibility after a candidate has passed official-source checks.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import unicodedata


TERMINAL_DISCOVERY = {"FOUND"}
RETRYABLE_DISCOVERY = {"PENDING", "NOT_FOUND", "PARTIAL", "FAILED"}
STAGE_NAMES = ("PARTICIPANTS", "FLOORPLAN", "SALES")
STAGE_STATES = {"PENDING", "RUNNING", "SUCCESS", "PARTIAL", "FAILED", "NOT_APPLICABLE"}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_name(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value)).casefold()


def candidate_key(name: str, scope: dict) -> str:
    years = scope["startDate"][:4] + ":" + scope["endDate"][:4]
    material = "\x1f".join((normalize_name(name), years))
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _write(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("wb") as output:
        output.write(data)
    try:
        temporary.chmod(0o600)
    except OSError:
        pass
    os.replace(temporary, path)


class EventNameQueue:
    def __init__(self, path: Path):
        self.path = path
        try:
            value = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        except (OSError, json.JSONDecodeError):
            value = {}
        if value.get("schemaVersion") != "1" or not isinstance(value.get("candidates"), dict):
            value = {"schemaVersion": "1", "updatedAt": utcnow(), "candidates": {}}
        self.value = value

    @property
    def candidates(self) -> dict[str, dict]:
        return self.value["candidates"]

    def save(self) -> None:
        self.value["updatedAt"] = utcnow()
        _write(self.path, self.value)

    def enqueue(self, names: list[str], scope: dict) -> list[dict]:
        queued = []
        for raw in names:
            name = raw.strip()
            key = candidate_key(name, scope)
            item = self.candidates.get(key)
            if item is None:
                item = {
                    "key": key,
                    "name": name,
                    "scope": dict(scope),
                    "state": "PENDING",
                    "attempts": 0,
                    "createdAt": utcnow(),
                    "lastAttemptAt": None,
                    "nextRetryAt": None,
                    "eventId": None,
                    "matchedEventName": None,
                    "sourceCoverage": [],
                    "issues": [],
                    "stages": {stage: {"state": "PENDING", "attempts": 0, "lastAttemptAt": None, "issues": []} for stage in STAGE_NAMES},
                }
                self.candidates[key] = item
            elif item.get("state") != "FOUND":
                item["scope"] = {
                    **item["scope"],
                    "startDate": min(item["scope"]["startDate"], scope["startDate"]),
                    "endDate": max(item["scope"]["endDate"], scope["endDate"]),
                }
            queued.append(item)
        if names:
            self.save()
        return queued

    def due(self, scope: dict, limit: int, max_attempts: int, now: datetime | None = None) -> list[dict]:
        now = now or datetime.now(timezone.utc)
        rows = []
        for item in self.candidates.values():
            candidate_scope=item.get("scope") or {}
            overlaps=not (candidate_scope.get("endDate","") < scope["startDate"] or candidate_scope.get("startDate","9999-12-31") > scope["endDate"])
            if not overlaps or item.get("state") not in RETRYABLE_DISCOVERY:
                continue
            if int(item.get("attempts", 0)) >= max_attempts:
                continue
            retry = _parse_time(item.get("nextRetryAt"))
            if retry and retry > now:
                continue
            rows.append(item)
        rows.sort(key=lambda item: (bool(item.get("lastAttemptAt")), item.get("lastAttemptAt") or "", item["createdAt"], item["key"]))
        return rows[:limit]

    def begin(self, key: str) -> int:
        item = self.candidates[key]
        item["attempts"] = int(item.get("attempts", 0)) + 1
        item["lastAttemptAt"] = utcnow()
        item["nextRetryAt"] = None
        self.save()
        return item["attempts"]

    def finish(self, key: str, state: str, *, retry_hours: int, event_id: int | None = None,
               matched_name: str | None = None, source_coverage: list | None = None,
               issues: list[str] | None = None) -> None:
        if state not in TERMINAL_DISCOVERY | RETRYABLE_DISCOVERY:
            raise ValueError("Unknown event-name discovery state")
        item = self.candidates[key]
        item["state"] = state
        item["eventId"] = event_id if event_id is not None else item.get("eventId")
        item["matchedEventName"] = matched_name
        item["sourceCoverage"] = list(source_coverage or [])[:6]
        item["issues"] = [str(value)[:300] for value in (issues or [])[:20]]
        item["nextRetryAt"] = None if state in TERMINAL_DISCOVERY else (
            datetime.now(timezone.utc) + timedelta(hours=retry_hours)
        ).isoformat().replace("+00:00", "Z")
        if state == "FOUND":
            for stage in STAGE_NAMES:
                item["stages"].setdefault(stage, {"state": "PENDING", "attempts": 0, "lastAttemptAt": None, "issues": []})
        self.save()

    def mark_stage(self, event_id: int, stage: str, state: str, issues: list[str] | None = None) -> bool:
        if stage not in STAGE_NAMES or state not in STAGE_STATES:
            raise ValueError("Unknown event-name stage state")
        changed = False
        for item in self.candidates.values():
            if item.get("eventId") != event_id:
                continue
            current = item["stages"].setdefault(stage, {"state": "PENDING", "attempts": 0, "lastAttemptAt": None, "issues": []})
            if state == "RUNNING" and current.get("state") != "RUNNING":
                current["attempts"] = int(current.get("attempts", 0)) + 1
            current.update(state=state, lastAttemptAt=utcnow(), issues=[str(value)[:300] for value in (issues or [])[:20]])
            changed = True
        if changed:
            self.save()
        return changed

    def summary(self, scope: dict) -> dict[str, int]:
        output = {state: 0 for state in ("PENDING", "FOUND", "NOT_FOUND", "PARTIAL", "FAILED")}
        for item in self.candidates.values():
            candidate_scope=item.get("scope") or {}
            overlaps=not (candidate_scope.get("endDate","") < scope["startDate"] or candidate_scope.get("startDate","9999-12-31") > scope["endDate"])
            if overlaps:
                output[item.get("state", "FAILED")] = output.get(item.get("state", "FAILED"), 0) + 1
        return output
