#!/usr/bin/env python3
"""Replace Seoul festival-site fallback artwork with verified 2026 posters."""
from __future__ import annotations

import argparse
import json
from urllib.parse import urlsplit

from backfill_public_media import API_DEFAULT, AdminApi, Candidate, fetch_promotional_image


GENERIC = "https://festival.seoul.go.kr/resources/img/common/img_meta_festa2.png"
POSTERS = {
    144: ("2026 서울국제정원박람회", "https://festival.seoul.go.kr/cmmn/file/getImage.do?atchFileId=a3ee2d35f7c548fd879ecab7375e7aeb&thumb=Y", "https://festival.seoul.go.kr/festival/main/festivalView.do?festacode=431"),
    145: ("한강플플 가을운동회", "https://festival.seoul.go.kr/cmmn/file/getImage.do?atchFileId=ac44de4c6fdc437ca23dde4a40a8c399&thumb=Y", "https://festival.seoul.go.kr/festival/main/festivalView.do?festacode=920"),
    147: ("2026 서울 바비큐 페스티벌", "https://festival.seoul.go.kr/cmmn/file/getImage.do?atchFileId=d4624b86ae924fd5847e57b474e3bcf8&thumb=Y", "https://festival.seoul.go.kr/festival/main/festivalView.do?festacode=350"),
}


def all_events(api: AdminApi) -> list[dict]:
    output = []
    page = 0
    while True:
        value = api.request("GET", f"/api/admin/subculture/v4/events?page={page}&size=100")
        output.extend(value["items"])
        if len(output) >= value["total"]:
            return output
        page += 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default=API_DEFAULT)
    parser.add_argument("--username", default="ROOT")
    parser.add_argument("--password", default="ROOT")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    api = AdminApi(args.api, args.username, args.password)

    details = {int(row["id"]): api.event(int(row["id"])) for row in all_events(api)}
    generic = [asset for detail in details.values() for asset in detail["assets"] if asset["imageUrl"] == GENERIC and asset["rightsState"] == "APPROVED"]
    report = {"mode": "apply" if args.apply else "dry-run", "genericRejected": [], "specificStored": [], "failed": []}
    if not args.apply:
        report["genericRejected"] = [{"eventId": a["eventId"], "assetId": a["id"]} for a in generic]
        report["specificStored"] = sorted(POSTERS)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    for asset in generic:
        try:
            api.request("PATCH", f"/api/admin/subculture/v4/assets/{asset['id']}/rights", {
                "revision": int(asset["revision"]),
                "rightsState": "REJECTED",
                "note": "행사별 포스터가 아닌 서울 축제 사이트 공통 메타 이미지이므로 대표 이미지에서 제외",
                "credit": asset.get("credit") or "festival.seoul.go.kr",
                "offlineAllowed": False,
            })
            report["genericRejected"].append({"eventId": asset["eventId"], "assetId": asset["id"]})
        except Exception as error:
            report["failed"].append({"assetId": asset["id"], "error": str(error)})

    for event_id, (caption, image_url, page_url) in POSTERS.items():
        candidate = Candidate(event_id, None, None, "BANNER", image_url, page_url, caption, "festival.seoul.go.kr")
        try:
            asset = api.register(candidate)
            asset = api.approve(asset, candidate)
            data, content_type, digest = fetch_promotional_image(image_url, urlsplit(image_url).hostname or "festival.seoul.go.kr")
            asset = api.upload(asset, data, content_type, digest)
            selection = api.event(event_id)["bannerSelection"]
            api.request("PUT", f"/api/admin/subculture/v4/events/{event_id}/banner", {
                "assetId": int(asset["id"]),
                "revision": int(selection["revision"]),
                "assetRevision": int(asset["revision"]),
            })
            report["specificStored"].append({"eventId": event_id, "assetId": asset["id"], "bytes": len(data)})
        except Exception as error:
            report["failed"].append({"eventId": event_id, "error": str(error)})

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
