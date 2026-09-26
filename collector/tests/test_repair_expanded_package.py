import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from repair_expanded_package import (
    PARTICIPANT_OVERRIDE_FIELDS,
    SALES_OVERRIDE_FIELDS,
    identity_key,
    load_package,
    selected_fields,
)


def source(url="https://example.com/item/1"):
    return {"url": url, "kind": "OFFICIAL", "access": "ORIGINAL", "evidence": "official evidence"}


def result(participant):
    return {
        "searchStatus": "PARTIAL", "summary": "reviewed manual result", "queries": ["official query"],
        "coverage": {"completeness": "PARTIAL", "reportedTotal": None, "totalUnit": "REGISTERED_BOOTHS",
                     "visitedPages": ["https://example.com/item/1"], "nextPageUrl": None, "warnings": []},
        "participants": [participant], "sales": None,
    }


class ExpandedPackageRepairTests(unittest.TestCase):
    def test_load_preserves_nested_lists_and_price_objects(self):
        event = {
            "name": "Test event", "subcategory": "COMIC_DOUJIN", "organizer": "Org", "edition": None,
            "region": "SEOUL", "venueName": "Venue", "address": None, "description": "Description",
            "admission": None, "subjects": [],
            "occurrences": [{"startDate": "2026-10-01", "endDate": "2026-10-01", "startTime": None, "endTime": None}],
            "sources": [source("https://example.com/event")], "banners": [], "warnings": [], "eventFormat": "MULTI_BOOTH",
            "discoveryLinks": [], "operationStatus": None,
        }
        participant = {
            "sourceEntryId": "p1", "registrationName": "Booth", "kind": "CIRCLE",
            "members": [{"name": "Artist", "kind": "ARTIST", "aliases": [], "profileUrl": None}],
            "locations": [{"code": "A-01", "status": "ASSIGNED", "hall": None, "zone": None,
                           "startDate": "2026-10-01", "endDate": "2026-10-01", "floorPlanUrl": None}],
            "subjects": [], "officialLinks": ["https://example.com/item/1"], "sources": [source()],
            "images": [], "warnings": [],
            "identity": {"sourceSystem": "https://example.com", "entryId": "p1", "detailUrl": "https://example.com/item/1"},
        }
        sales = result(participant)
        sales["participants"] = []
        sales["coverage"]["totalUnit"] = "PRODUCTS"
        sales["sales"] = {
            "summary": "Listed item", "evidenceScope": "EVENT_LISTED", "categories": ["BOOK"], "subjects": [],
            "salesMethod": None, "sources": [source()], "images": [], "warnings": [],
            "products": [{"sourceEntryId": "g1", "name": "Book", "summary": "Summary", "memberName": "Artist",
                          "categories": ["BOOK"], "subjects": [], "evidenceScope": "EVENT_LISTED",
                          "price": {"amount": "4000", "currency": "KRW", "checkedOn": "2026-09-26", "note": "listed"},
                          "saleState": "PLANNED", "productUrl": "https://example.com/item/1", "sources": [source()],
                          "images": [], "warnings": [],
                          "identity": {"sourceSystem": "https://example.com", "entryId": "g1", "detailUrl": "https://example.com/item/1"}}],
        }
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "package.zip"
            prefix = "package"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr(f"{prefix}/research/event_index.json", json.dumps([{"researchKey": "SC01", "event": event}]))
                archive.writestr(f"{prefix}/research/participant_index.json", json.dumps([{
                    "researchKey": "0123456789abcdef", "eventKey": "SC01", "participant": participant,
                }]))
                archive.writestr(f"{prefix}/data/participants/SC01_part01.result.json", json.dumps(result(participant)))
                archive.writestr(f"{prefix}/data/sales/SC01_0123456789abcdef.result.json", json.dumps(sales))
            package = load_package(path)
        self.assertEqual(package.participant_count, 1)
        self.assertEqual(package.participant_files[0][2]["participants"][0]["members"][0]["aliases"], [])
        self.assertIsInstance(package.sales_files[0][3]["sales"]["products"][0]["price"], dict)
        self.assertEqual(package.sales_files[0][3]["sales"]["products"][0]["categories"], ["BOOK"])

    def test_identity_ignores_fragment_and_trailing_slash(self):
        self.assertEqual(identity_key({"identity": {"sourceSystem": "https://example.com/", "entryId": "p1", "detailUrl": "https://example.com/p/1/#x"}}),
                         ("https://example.com", "p1", "https://example.com/p/1"))

    def test_admin_overrides_keep_structured_values(self):
        participant = {field: [] for field in PARTICIPANT_OVERRIDE_FIELDS}
        participant.update({"registrationName": "Booth", "kind": "CIRCLE"})
        sales = {field: [] for field in SALES_OVERRIDE_FIELDS}
        sales.update({"summary": "Summary", "evidenceScope": "EVENT_LISTED", "salesMethod": None,
                      "products": [{"price": {"amount": "4000", "currency": "KRW"}}]})
        self.assertEqual(selected_fields(participant, PARTICIPANT_OVERRIDE_FIELDS)["members"], [])
        self.assertIsInstance(selected_fields(sales, SALES_OVERRIDE_FIELDS)["products"][0]["price"], dict)


if __name__ == "__main__":
    unittest.main()
