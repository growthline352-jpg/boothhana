#!/usr/bin/env python3
"""Finalize the verified integrated CSV additions in the production catalog.

Only facts supported by the event's official source or an official venue page are
added. Unknown 2026 times, admission rules, exhibitors and floor plans remain
unknown instead of being copied from a previous edition.
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata

from backfill_public_media import API_DEFAULT, AdminApi


OFFICIAL_LINK = {
    144: "https://festival.seoul.go.kr/festival/main/festivalView.do?festacode=431",
    145: "https://festival.seoul.go.kr/festival/main/festivalView.do?festacode=920",
    146: "https://festival.seoul.go.kr/festival/main/festivalView.do?festacode=556",
    147: "https://festival.seoul.go.kr/festival/main/festivalView.do?festacode=350",
    148: "https://festival.seoul.go.kr/festival/main/festivalView.do?festacode=601",
}


VERIFIED_OVERRIDES: dict[int, dict] = {
    144: {
        "address": "서울특별시 성동구 뚝섬로 273",
        "admission": "무료(일부 체험 유료)",
        "description": "서울숲 곳곳에 캐릭터 팝업정원, 정원마켓, 가든퍼니처 특별전이 분산 배치되는 정원 문화 행사입니다.",
        "warnings": [
            "서울숲 곳곳에 분산 배치된 행사입니다.",
            "정원마켓 56개소와 가든퍼니처 특별전 9개소는 공식 안내의 행사 규모이며, DB 참가 부스 수를 의미하지 않습니다.",
            "개별 체험·마켓 운영시간은 공식 페이지에서 확인하세요.",
        ],
        "discoveryLinks": [{"kind": "OFFICIAL", "url": OFFICIAL_LINK[144], "status": "PUBLISHED", "note": "서울시 공식 축제 안내"}],
    },
    145: {
        "address": "서울특별시 광진구 강변북로 2273",
        "warnings": [
            "프로그램별 운영시간은 다를 수 있습니다.",
            "플리마켓 30팀·푸드트럭 15대는 공식 안내의 계획 규모이며, DB에 수집 완료된 참가 부스 수를 의미하지 않습니다.",
        ],
        "discoveryLinks": [{"kind": "OFFICIAL", "url": OFFICIAL_LINK[145], "status": "PUBLISHED", "note": "서울시 공식 축제 안내"}],
    },
    146: {
        "address": "서울특별시 마포구 월드컵로 243-60",
        "description": "새우젓과 지역 특산물 판매, 먹거리, 공연·체험 프로그램을 운영하는 마포구 축제입니다.",
        "warnings": [
            "공식 페이지의 2026년 세부 프로그램과 전체 운영시간은 아직 미정입니다.",
            "페이지 본문의 2025년 일정·프로그램을 2026년 정보로 사용하지 않았습니다.",
            "공식 페이지에 독립된 2026 배치도 파일이 없어 일반 안내 링크를 배치도로 표시하지 않습니다.",
        ],
        "discoveryLinks": [{"kind": "OFFICIAL", "url": OFFICIAL_LINK[146], "status": "PUBLISHED", "note": "서울시 공식 축제 안내"}],
    },
    147: {
        "address": "서울특별시 마포구 한강난지로 28",
        "description": "K-바비큐와 도심 캠핑·피크닉을 결합해 셀프 BBQ존, 바비큐 마스터즈, 바비큐 빌리지 등을 운영하는 미식 축제입니다.",
        "warnings": [
            "무료 입장이며 고기·음식 구매와 일부 좌석·체험은 별도입니다.",
            "공식 행사장 지도는 공식 안내 페이지에서 확인할 수 있으며, 참가 브랜드별 판매상품·재고는 아직 공개되지 않았습니다.",
        ],
        "discoveryLinks": [{"kind": "OFFICIAL", "url": OFFICIAL_LINK[147], "status": "PUBLISHED", "note": "서울시 공식 축제 안내·행사장 지도"}],
    },
    148: {
        "address": "서울특별시 중구 덕수궁길·정동길 일대",
        "description": "정동 일대 역사문화시설 야간 개방, 고궁음악회, 해설 투어와 역사체험을 운영하는 문화유산 야간 축제입니다.",
        "warnings": [
            "10월 29일은 미리정동야행, 10월 30일은 개막일입니다.",
            "공식 페이지의 대표 포스터는 2025년 자료이므로 2026년 대표 이미지로 지정하지 않았습니다.",
            "시설별 운영시간·예약·요금은 2026년 공식 안내가 추가되면 갱신해야 합니다.",
        ],
        "discoveryLinks": [{"kind": "OFFICIAL", "url": OFFICIAL_LINK[148], "status": "PUBLISHED", "note": "서울시 공식 축제 안내"}],
    },
}


def norm(value: str | None) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value or "")).casefold()


def all_events(api: AdminApi) -> list[dict]:
    result: list[dict] = []
    page = 0
    while True:
        value = api.request("GET", f"/api/admin/subculture/v4/events?page={page}&size=100")
        result.extend(value["items"])
        if len(result) >= value["total"]:
            return result
        page += 1


def edit(api: AdminApi, event_id: int, state: str, note: str, overrides: dict) -> dict:
    detail = api.event(event_id)
    return api.request("PATCH", f"/api/admin/subculture/v4/events/{event_id}", {
        "revision": int(detail["revision"]),
        "reviewState": state,
        "note": note,
        "overrides": overrides,
        "clearOverrides": [],
    })


def publish(api: AdminApi, event_id: int) -> None:
    detail = api.event(event_id)
    api.request("POST", f"/api/admin/subculture/v4/events/{event_id}/publish", {"eventRevision": int(detail["revision"])})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default=API_DEFAULT)
    parser.add_argument("--username", default="ROOT")
    parser.add_argument("--password", default="ROOT")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    api = AdminApi(args.api, args.username, args.password)
    rows = all_events(api)
    details = {int(row["id"]): api.event(int(row["id"])) for row in rows}

    # Learn addresses only from exact venue-name matches with one unambiguous,
    # already-reviewed official address. This does not fuzzily match hall names.
    venue_addresses: dict[str, set[str]] = {}
    for detail in details.values():
        event = detail["event"]
        if detail["reviewState"] == "REVIEWED" and event.get("venueName") and event.get("address"):
            venue_addresses.setdefault(norm(event["venueName"]), set()).add(event["address"])
    unique_addresses = {key: next(iter(values)) for key, values in venue_addresses.items() if len(values) == 1}

    propagated: list[dict] = []
    for event_id, detail in details.items():
        event = detail["event"]
        key = norm(event.get("venueName"))
        address = unique_addresses.get(key)
        if event_id in VERIFIED_OVERRIDES or event.get("address") or not address:
            continue
        # Never make a pending candidate public merely because another event
        # supplies the same venue address.
        if detail["reviewState"] != "REVIEWED" or not detail.get("publication"):
            continue
        propagated.append({"id": event_id, "name": event["name"], "venue": event["venueName"], "address": address})

    report = {
        "mode": "apply" if args.apply else "dry-run",
        "verifiedEvents": sorted(VERIFIED_OVERRIDES),
        "addressPropagation": propagated,
        "reviewedAndPublished": [],
        "republishedAddressFixes": [],
    }
    if not args.apply:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    for event_id, overrides in VERIFIED_OVERRIDES.items():
        edit(api, event_id, "REVIEWED", "2026-09-27 공식 원문 재검증 및 기본정보 보강", overrides)
        publish(api, event_id)
        report["reviewedAndPublished"].append(event_id)

    for item in propagated:
        edit(api, item["id"], "REVIEWED", "동일 공식 행사장 주소 보강", {"address": item["address"]})
        publish(api, item["id"])
        report["republishedAddressFixes"].append(item["id"])

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
