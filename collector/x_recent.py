"""Small X recent-search client used only to collect untrusted event leads."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ENDPOINT = "https://api.x.com/2/tweets/search/recent"


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def recent_window(days: int = 7, now: datetime | None = None) -> tuple[datetime, datetime]:
    if not 1 <= days <= 7:
        raise ValueError("X recent-search window must be between 1 and 7 days")
    # X can reject an end_time that is too close to the current second.
    end = (now or datetime.now(timezone.utc)) - timedelta(seconds=15)
    return end - timedelta(days=days), end


def search_recent(query: str, *, token_env: str = "X_BEARER_TOKEN", days: int = 7,
                  max_pages: int = 2, timeout: int = 30, now: datetime | None = None) -> dict:
    """Return bounded public X posts without ever exposing the bearer token to the CLI."""
    token = os.environ.get(token_env, "").strip()
    start, end = recent_window(days, now)
    result = {
        "status": "DISABLED" if not token else "COMPLETE",
        "query": query,
        "startTime": _iso(start),
        "endTime": _iso(end),
        "pages": 0,
        "posts": [],
        "issues": [] if token else [f"{token_env} is not configured"],
    }
    if not token:
        return result
    if not 1 <= max_pages <= 20:
        raise ValueError("max_pages outside allowed range")

    next_token = None
    seen = set()
    for _ in range(max_pages):
        params = {
            "query": query,
            "start_time": result["startTime"],
            "end_time": result["endTime"],
            "max_results": "100",
            "tweet.fields": "created_at,author_id,entities",
            "expansions": "author_id",
            "user.fields": "username,name",
        }
        if next_token:
            params["pagination_token"] = next_token
        request = Request(ENDPOINT + "?" + urlencode(params), headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/json",
            "User-Agent": "BoothHanaCollector/1.0",
        })
        try:
            with urlopen(request, timeout=timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            result["status"] = "PARTIAL" if result["posts"] else "FAILED"
            result["issues"].append(f"X API HTTP {exc.code}")
            break
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            result["status"] = "PARTIAL" if result["posts"] else "FAILED"
            result["issues"].append("X API " + type(exc).__name__)
            break

        result["pages"] += 1
        users = {row.get("id"): row for row in (payload.get("includes") or {}).get("users") or []}
        for post in payload.get("data") or []:
            post_id = str(post.get("id") or "")
            if not post_id or post_id in seen:
                continue
            seen.add(post_id)
            user = users.get(post.get("author_id")) or {}
            username = user.get("username")
            urls = []
            for entry in (post.get("entities") or {}).get("urls") or []:
                value = entry.get("expanded_url") or entry.get("unwound_url") or entry.get("url")
                if isinstance(value, str) and value.startswith(("http://", "https://")):
                    urls.append(value)
            result["posts"].append({
                "id": post_id,
                "createdAt": post.get("created_at"),
                "authorId": post.get("author_id"),
                "username": username,
                "text": str(post.get("text") or "")[:4000],
                "postUrl": f"https://x.com/{username}/status/{post_id}" if username else f"https://x.com/i/status/{post_id}",
                "linkedUrls": list(dict.fromkeys(urls))[:10],
            })
        next_token = (payload.get("meta") or {}).get("next_token")
        if not next_token:
            break
    if next_token and result["pages"] >= max_pages:
        result["status"] = "PARTIAL"
        result["issues"].append("X API page limit reached")
    return result
