#!/usr/bin/env python3
"""Discover official public media, associate it with catalog records, and optionally store it.

The default is a read-only dry run. Use --apply to register candidates and --approve
to apply the operator's explicit promotional-use approval before uploading bytes.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import html
import io
from html.parser import HTMLParser
import http.cookiejar
import json
import os
import re
import sys
import unicodedata
from dataclasses import dataclass, asdict
from urllib.error import HTTPError
from urllib.parse import quote, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener

from PIL import Image as PillowImage, ImageOps
from media_fetch import MediaError, fetch_html, fetch_image, inspect_image


API_DEFAULT = "https://api.boothana.kr"
EXPLICITLY_RESTRICTED = {
    "https://dongne.co/api/images/5633?size=large",
    "w_R7vKfX_Jy4zD",
}


def fetch_promotional_image(url: str, host: str) -> tuple[bytes, str, str]:
    """Fetch a normal image, or make a bounded display derivative for huge JPEGs."""
    try:
        return fetch_image(url, [host])
    except MediaError as error:
        if str(error) != "Image format/pixel limit mismatch" or not urlsplit(url).path.lower().endswith((".jpg", ".jpeg")):
            raise
    source, content_type, _ = fetch_image(url, [host], max_pixels=150_000_000)
    with PillowImage.open(io.BytesIO(source)) as opened:
        opened.draft("RGB", (4000, 4000))
        image = ImageOps.exif_transpose(opened).convert("RGB")
        image.thumbnail((4000, 4000), PillowImage.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=88, optimize=True, progressive=True)
    data = output.getvalue()
    digest = inspect_image(data, "image/jpeg")
    return data, "image/jpeg", digest


def normalized(value: str | None) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value or "")).casefold()


def absolute(base: str, value: str | None) -> str | None:
    if not value:
        return None
    return urljoin(base, html.unescape(value).strip())


@dataclass(frozen=True)
class Candidate:
    event_id: int
    participant_id: int | None
    product_id: int | None
    type: str
    image_url: str
    page_url: str
    caption: str
    credit: str

    def key(self) -> tuple:
        return self.event_id, self.participant_id, self.product_id, self.type, self.image_url, self.page_url


class AdminApi:
    def __init__(self, base: str, username: str, password: str):
        self.base = base.rstrip("/")
        self.opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
        csrf = self.request("GET", "/api/auth/csrf")
        self.csrf = csrf["token"]
        self.request("POST", "/api/auth/admin/login", {"username": username, "password": password})

    def request(self, method: str, path: str, body=None, headers=None):
        headers = dict(headers or {})
        data = body
        if isinstance(body, (dict, list)):
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if method not in ("GET", "HEAD") and hasattr(self, "csrf"):
            headers["X-XSRF-TOKEN"] = self.csrf
        request = Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=90) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:600]
            raise RuntimeError(f"{method} {path}: HTTP {error.code}: {detail}") from error

    def events(self):
        result=[];seen=set();page=0
        while True:
            value=self.request("GET", f"/api/admin/subculture/v4/events?page={page}&size=100")
            items=value['items']
            if not items and len(result)<value['total']:raise RuntimeError('Incomplete event pagination')
            for row in items:
                if row['id'] in seen:raise RuntimeError('Non-advancing event pagination')
                seen.add(row['id']);result.append(row)
            if len(result)>=value['total']:return result
            page+=1

    def event(self, event_id: int):
        return self.request("GET", f"/api/admin/subculture/v4/events/{event_id}")

    def participants(self, event_id: int):
        result = []
        page = 0
        while True:
            value = self.request("GET", f"/api/admin/subculture/v4/events/{event_id}/participants?page={page}&size=100")
            result.extend(value["items"])
            if len(result) >= value["total"]:
                return result
            page += 1

    def register(self, candidate: Candidate):
        return self.request("POST", f"/api/admin/subculture/v4/events/{candidate.event_id}/assets", {
            "participantId": candidate.participant_id,
            "productId": candidate.product_id,
            "image": {
                "type": candidate.type,
                "imageUrl": candidate.image_url,
                "pageUrl": candidate.page_url,
                "rightsEvidence": "공식 공개 페이지의 이미지 후보. 해당 회차 및 사용 승인은 별도 검토.",
                "caption": candidate.caption[:1000],
            },
        })

    def approve(self, asset: dict, candidate: Candidate):
        if asset["rightsState"] == "APPROVED":
            return asset
        return self.request("PATCH", f"/api/admin/subculture/v4/assets/{asset['id']}/rights", {
            "revision": asset["revision"],
            "rightsState": "APPROVED",
            "note": "운영 홍보용 사용을 사용자가 승인함. 원문 출처를 유지하고 권리 요청 시 즉시 비공개.",
            "credit": candidate.credit,
            "offlineAllowed": False,
        })

    def upload(self, asset: dict, data: bytes, content_type: str, digest: str):
        return self.request("POST", f"/api/admin/subculture/v4/assets/{asset['id']}/content", data, {
            "Content-Type": content_type,
            "X-Image-Size": str(len(data)),
            "X-Image-SHA256": digest,
            "X-Asset-Revision": str(asset["revision"]),
        })

    def publish(self, event_id: int):
        detail = self.event(event_id)
        return self.request("POST", f"/api/admin/subculture/v4/events/{event_id}/publish", {"eventRevision": detail["revision"]})


class ComiverseParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.booths: list[dict] = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "div" and "booth-item" in values.get("class", "").split():
            info = []
            try:
                info = json.loads(values.get("data-info-images") or "[]")
            except json.JSONDecodeError:
                pass
            self.booths.append({
                "name": values.get("data-booth-name", ""),
                "number": values.get("data-booth-display-no", ""),
                "catalog": values.get("data-catalog-image") or values.get("data-image"),
                "info": list(dict.fromkeys([x for x in info if x])),
            })


class ProjectDollParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.current_id: str | None = None
        self.current_href: str | None = None
        self.items: list[dict] = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "li" and values.get("id", "").startswith("anchorBoxId_"):
            self.current_id = values["id"].removeprefix("anchorBoxId_")
            self.current_href = None
        elif self.current_id and tag == "a" and values.get("href", "").startswith("/product/"):
            self.current_href = values["href"]
        elif self.current_id and self.current_href and tag == "img" and "/web/product/" in values.get("src", ""):
            self.items.append({"id": self.current_id, "href": self.current_href, "image": values["src"], "name": values.get("alt", "")})
            self.current_id = None
            self.current_href = None

    def handle_endtag(self, tag):
        if tag == "li":
            self.current_id = None
            self.current_href = None


class OpenGraphParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.images: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag != "meta":
            return
        values = {k.lower(): v for k, v in attrs}
        label = (values.get("property") or values.get("name") or "").lower()
        if label in ("og:image", "og:image:secure_url", "twitter:image") and values.get("content"):
            self.images.append(values["content"])


def source_html(url: str) -> str:
    parts = urlsplit(url)
    host = parts.hostname
    if not host:
        raise ValueError("source host missing")
    encoded = urlunsplit((parts.scheme, parts.netloc, quote(parts.path, safe="/%:@"), quote(parts.query, safe="=&;%:+,?/@"), parts.fragment))
    return fetch_html(encoded, [host])[0]


def participant_indexes(rows: list[dict]):
    names: dict[str, list[dict]] = {}
    entries: dict[str, dict] = {}
    products: dict[str, tuple[dict, dict]] = {}
    for row in rows:
        data = row["data"]
        names.setdefault(normalized(data.get("registrationName")), []).append(row)
        entry = data.get("sourceEntryId") or (data.get("identity") or {}).get("entryId")
        if entry:
            entries[str(entry)] = row
        for product in ((row.get("sales") or {}).get("productRows") or []):
            pdata = product["data"]
            key = pdata.get("sourceEntryId") or (pdata.get("identity") or {}).get("entryId")
            if key:
                products[str(key)] = (row, product)
    return names, entries, products


def unique_name_match(names: dict[str, list[dict]], value: str) -> dict | None:
    key = normalized(value)
    exact = names.get(key, [])
    if len(exact) == 1:
        return exact[0]
    close = difflib.get_close_matches(key, names.keys(), n=2, cutoff=0.94)
    if len(close) == 1 and len(names[close[0]]) == 1:
        return names[close[0]][0]
    return None


def discover_comiverse(event: dict, participants: list[dict]) -> tuple[list[Candidate], dict]:
    page = "https://app.comiverse.kr/"
    parser = ComiverseParser()
    parser.feed(source_html(page))
    names, _, _ = participant_indexes(participants)
    found: list[Candidate] = []
    unmatched = []
    for booth in parser.booths:
        participant = unique_name_match(names, booth["name"])
        if participant is None:
            unmatched.append(booth["name"])
        participant_id = participant["id"] if participant else None
        if booth["catalog"]:
            found.append(Candidate(event["id"], participant_id, None, "BOOTH_CUT", absolute(page, booth["catalog"]), page,
                f"{booth['name']} 부스컷" + (f" · {booth['number']}" if booth["number"] else ""), "코미버스 공식 웹카탈로그"))
        for index, image in enumerate(booth["info"], 1):
            found.append(Candidate(event["id"], participant_id, None, "SALES_SHEET", absolute(page, image), page,
                f"{booth['name']} 판매·부스 안내 {index}", "코미버스 공식 웹카탈로그"))
    return found, {"sourceRows": len(parser.booths), "unmatched": unmatched}


def discover_projectdoll(event: dict, participants: list[dict]) -> tuple[list[Candidate], dict]:
    page = "https://projectdoll.net/category/41th-SEOUL/81/"
    parser = ProjectDollParser()
    parser.feed(source_html(page))
    _, entries, _ = participant_indexes(participants)
    found = []
    unmatched = []
    for item in parser.items:
        participant = entries.get(item["id"])
        if participant is None:
            unmatched.append(item["id"])
        caption = item["name"] or (participant["data"]["registrationName"] if participant else f"PROJECTDOLL 참가자 {item['id']}")
        found.append(Candidate(event["id"], participant["id"] if participant else None, None, "BOOTH_CUT", absolute(page, item["image"]), absolute(page, item["href"]),
            caption, "PROJECTDOLL 공식 참가자 소개"))
    return found, {"sourceRows": len(parser.items), "unmatched": unmatched}


WORK_CARD = re.compile(
    r'<img\s+src="(?P<image>/api/images/[^"?]+\?size=[^"]+)"\s+alt="(?P<alt>[^"]*)".{0,3500}?'
    r'<a\s+href="/works/(?P<id>w_[A-Za-z0-9_-]+)"[^>]*>(?P<title>.*?)</a>', re.S)


def discover_dongne(event: dict, participants: list[dict], slug: str) -> tuple[list[Candidate], dict]:
    _, _, products = participant_indexes(participants)
    found = []
    seen = set()
    pages = 0
    for page_number in range(1, 11):
        page = f"https://dongne.co/events/{slug}/works?page={page_number}"
        text = source_html(page)
        matches = list(WORK_CARD.finditer(text))
        new_ids = [match.group("id") for match in matches if match.group("id") not in seen]
        if not new_ids:
            break
        pages += 1
        for match in matches:
            work_id = match.group("id")
            if work_id in seen:
                continue
            seen.add(work_id)
            image_url = absolute(page, re.sub(r"size=[^&]+", "size=large", match.group("image")))
            if work_id in EXPLICITLY_RESTRICTED or image_url in EXPLICITLY_RESTRICTED:
                continue
            participant_id = product_id = None
            linked = products.get(work_id)
            if linked:
                participant_id, product_id = linked[0]["id"], linked[1]["id"]
            title = html.unescape(re.sub(r"<[^>]+>", "", match.group("title"))).strip() or html.unescape(match.group("alt"))
            work_page = f"https://dongne.co/works/{work_id}"
            found.append(Candidate(event["id"], participant_id, product_id, "PRODUCT", image_url, work_page, title, "동인네트워크 공식 작품 목록"))
    return found, {"sourceRows": len(seen), "pages": pages, "linkedProducts": sum(1 for item in found if item.product_id is not None)}


def discover_generic_banners(api: AdminApi, events: list[dict]) -> tuple[list[Candidate], dict]:
    found = []
    skipped = []
    from event_detail_sources import allowed_by_robots
    robots_cache={}
    for row in events:
        detail = api.event(row["id"])
        if any(asset["type"] == "BANNER" and asset.get("storageState") == "STORED" and asset.get('rightsState')=='APPROVED' for asset in detail.get("assets", [])):
            continue
        sources = [item["url"] for item in ((detail.get("event") or {}).get("sources") or [])
                   if item.get("url") and item.get("access") != "INACCESSIBLE"]
        if not sources:
            skipped.append({"event": row["name"], "reason": "no-source"})
            continue
        seen_images = set()
        source_errors = []
        for source in sources[:3]:
            try:
                from official_poster_sources import poster_detail_url,parse_poster_document
                if not allowed_by_robots(source,[urlsplit(source).hostname],15,robots_cache):
                    source_errors.append('robots-blocked');continue
                text=source_html(source)
                if poster_detail_url(source):
                    document=parse_poster_document(text,source,'',row['name'])
                    image=next((x['url'] for x in document['images'] if x['role'] in ('POSTER','PAGE_PREVIEW','CONTENT','BACKGROUND')),None)
                else:
                    parser = OpenGraphParser();parser.feed(text)
                    image = next((absolute(source, value) for value in parser.images if absolute(source, value)), None)
                if not image:
                    source_errors.append("no-og-image")
                    continue
                if image not in seen_images:
                    found.append(Candidate(row["id"], None, None, "BANNER", image, source, row["name"], urlsplit(source).hostname or "공식 행사 페이지"))
                    seen_images.add(image)
            except Exception as error:
                source_errors.append(type(error).__name__)
        if not seen_images:
            skipped.append({"event": row["name"], "reason": ",".join(dict.fromkeys(source_errors)) or "no-og-image"})
    return found, {"skipped": skipped}


def unique_candidates(values: list[Candidate]) -> list[Candidate]:
    result = {}
    for value in values:
        # data: placeholders such as the Comiverse "미정" SVG are not source artwork.
        # Upgrade the one known legacy official asset host before the HTTPS-only fetch.
        if value.image_url.startswith("http://www.cafenbakeryfair.com/"):
            value = Candidate(**{**asdict(value), "image_url": value.image_url.replace("http://", "https://", 1)})
        if value.image_url and value.page_url and urlsplit(value.image_url).scheme == "https" and value.image_url not in EXPLICITLY_RESTRICTED:
            result[value.key()] = value
    return list(result.values())


def execute(args) -> dict:
    api = AdminApi(args.api, args.username, args.password)
    events = api.events()
    by_name = {row["name"]: row for row in events}
    candidates: list[Candidate] = []
    diagnostics = {}
    targets = [
        ("코미버스 2026 가을", discover_comiverse, None),
        ("41회 서울 프로젝트돌", discover_projectdoll, None),
        ("제35회 디. 페스타 (토요일)", discover_dongne, "df2610"),
        ("제35회 디. 페스타 (일요일)", discover_dongne, "df261002"),
    ]
    for name, discover, extra in targets:
        event = by_name.get(name)
        if not event:
            diagnostics[name] = {"error": "event-not-found"}
            continue
        participants = api.participants(event["id"])
        values, note = discover(event, participants, extra) if extra else discover(event, participants)
        candidates.extend(values)
        diagnostics[name] = {**note, "candidates": len(values)}
    generic, generic_note = discover_generic_banners(api, events)
    candidates.extend(generic)
    diagnostics["genericBanners"] = {**generic_note, "candidates": len(generic)}
    candidates = unique_candidates(candidates)
    summary = {"discovered": len(candidates), "registered": 0, "stored": 0, "existingStored": 0, "failed": [], "diagnostics": diagnostics}
    if not args.apply and args.list_candidates:
        summary["candidates"] = [asdict(value) for value in candidates]
    if not args.apply:
        return summary
    changed_events = set()
    from event_detail_sources import allowed_by_robots
    robots_cache={}
    for candidate in candidates:
        try:
            asset = api.register(candidate)
            summary["registered"] += 1
            if asset["storageState"] == "STORED" and asset["rightsState"] == "APPROVED":
                summary["existingStored"] += 1
                continue
            if not args.approve:
                continue
            asset = api.approve(asset, candidate)
            if asset["storageState"] != "STORED":
                host = urlsplit(candidate.image_url).hostname
                if not allowed_by_robots(candidate.image_url,[host],15,robots_cache):raise MediaError('Image blocked by source robots policy')
                data, content_type, digest = fetch_promotional_image(candidate.image_url, host)
                asset = api.upload(asset, data, content_type, digest)
            if asset["storageState"] == "STORED":
                summary["stored"] += 1
                changed_events.add(candidate.event_id)
        except Exception as error:
            summary["failed"].append({"url": candidate.image_url, "caption": candidate.caption, "error": f"{type(error).__name__}: {error}"[:500]})
    if args.publish:
        summary["published"] = []
        for event_id in sorted(changed_events):
            try:
                api.publish(event_id)
                summary["published"].append(event_id)
            except Exception as error:
                summary["failed"].append({"eventId": event_id, "error": f"publish: {type(error).__name__}: {error}"[:500]})
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default=os.getenv("BOOTH_API_BASE", API_DEFAULT))
    parser.add_argument("--username", default=os.getenv("BOOTH_ADMIN_USERNAME"))
    parser.add_argument("--password", default=os.getenv("BOOTH_ADMIN_PASSWORD"))
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--approve", action="store_true")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--list-candidates", action="store_true")
    args = parser.parse_args(argv)
    if not args.username or not args.password:
        parser.error("BOOTH_ADMIN_USERNAME and BOOTH_ADMIN_PASSWORD are required")
    if (args.approve or args.publish) and not args.apply:
        parser.error("--approve/--publish require --apply")
    print(json.dumps(execute(args), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        raise SystemExit(1)
