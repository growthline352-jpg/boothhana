"""Persist a five-hour CLI usage cooldown shared by jobs using the same login.

No network calls, quota resets, credential changes, or model fallbacks.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
import time

RETRY_SECONDS = 5 * 60 * 60


def auth_root(cfg: dict) -> Path:
    return Path(cfg.get('codexHome') or os.getenv('CODEX_HOME') or Path.home() / '.codex').expanduser()


def account_key(cfg: dict) -> str:
    key = os.getenv('CODEX_API_KEY')
    if not key:
        path = auth_root(cfg) / 'auth.json'
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
            tokens = data.get('tokens') or {}
            key = tokens.get('account_id') or data.get('account_id')
        except (OSError, ValueError, AttributeError):
            pass
    # Token refreshes do not change the account ID. No credential is persisted here.
    return hashlib.sha256(str(key or auth_root(cfg).resolve()).encode()).hexdigest()


def active_cooldown(cfg: dict, *, now: float | None = None) -> dict | None:
    path = auth_root(cfg) / 'collector-usage-cooldown.json'
    try:
        if path.stat().st_size > 4096:
            raise ValueError('Oversized usage cooldown checkpoint')
        value = json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return None
    stamp = time.time() if now is None else now
    if value.get('accountKey') != account_key(cfg):
        return None
    retry = value.get('retryAtUnix')
    if isinstance(retry, bool) or not isinstance(retry, (int, float)) or not math.isfinite(retry):
        raise ValueError('Invalid usage cooldown timestamp')
    remaining = math.ceil(retry - stamp)
    if remaining <= 0:
        return None
    return {**value, 'remainingSeconds': remaining}


def start_cooldown(cfg: dict, *, now: float | None = None) -> dict:
    """Called only for an actual provider usage-limit response, never a cached skip."""
    stamp = time.time() if now is None else now
    previous = active_cooldown(cfg, now=stamp)
    if previous:
        return previous
    retry = stamp + RETRY_SECONDS
    value = {'version': 1, 'reason': 'USAGE_LIMIT', 'accountKey': account_key(cfg),
             'detectedAtUnix': stamp, 'retryAtUnix': retry,
             'retryAt': datetime.fromtimestamp(retry, timezone.utc).isoformat()}
    root = auth_root(cfg)
    root.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix='.collector-usage-', suffix='.tmp', dir=root)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump(value, output, ensure_ascii=False)
            output.flush()
            os.fsync(output.fileno())
        os.replace(name, root / 'collector-usage-cooldown.json')
    finally:
        Path(name).unlink(missing_ok=True)
    return {**value, 'remainingSeconds': RETRY_SECONDS}
