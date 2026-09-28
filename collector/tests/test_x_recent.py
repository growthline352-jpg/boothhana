import json
import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import x_recent


class FakeResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.payload


class XRecentTests(unittest.TestCase):
    def test_missing_token_disables_api_without_network(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(x_recent, "urlopen") as opened:
            result = x_recent.search_recent("온리전")
        self.assertEqual(result["status"], "DISABLED")
        opened.assert_not_called()

    def test_recent_search_maps_posts_and_never_returns_token(self):
        payload = {
            "data": [{"id": "123", "author_id": "u1", "created_at": "2026-09-27T10:00:00Z",
                      "text": "온리전 공지", "entities": {"urls": [{"expanded_url": "https://example.com/event"}]}}],
            "includes": {"users": [{"id": "u1", "username": "organizer", "name": "주최"}]},
            "meta": {"result_count": 1},
        }
        with patch.dict(os.environ, {"X_BEARER_TOKEN": "secret-token"}), patch.object(x_recent, "urlopen", return_value=FakeResponse(payload)):
            result = x_recent.search_recent("온리전", now=datetime(2026, 9, 28, 12, 0, tzinfo=timezone.utc))
        self.assertEqual(result["status"], "COMPLETE")
        self.assertEqual(result["posts"][0]["postUrl"], "https://x.com/organizer/status/123")
        self.assertEqual(result["posts"][0]["linkedUrls"], ["https://example.com/event"])
        self.assertNotIn("secret-token", json.dumps(result, ensure_ascii=False))
        self.assertEqual(result["startTime"], "2026-09-21T11:59:45Z")


if __name__ == "__main__":
    unittest.main()
