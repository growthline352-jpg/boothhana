import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from doctor import report


class DoctorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.config = Path(self.temporary.name) / "config.json"
        self.config.write_text(json.dumps({}), encoding="utf-8")

    def test_healthy_runtime_does_not_echo_secrets(self):
        codex_home = Path(self.temporary.name) / "codex"
        codex_home.mkdir()
        (codex_home / "auth.json").write_text("{}", encoding="utf-8")
        with patch.dict(
            os.environ,
            {"BOOTH_COLLECTOR_TOKEN": "t" * 32, "CODEX_HOME": str(codex_home)},
            clear=False,
        ), patch("doctor.shutil.which", return_value="/usr/local/bin/codex"):
            checks, healthy = report(self.config)

        self.assertTrue(healthy)
        self.assertTrue(checks["codexLoginConfigured"])
        self.assertNotIn("t" * 32, json.dumps(checks))

    def test_missing_codex_login_is_unhealthy(self):
        with patch.dict(
            os.environ,
            {
                "BOOTH_COLLECTOR_TOKEN": "t" * 32,
                "CODEX_HOME": str(Path(self.temporary.name) / "missing"),
            },
            clear=False,
        ), patch("doctor.shutil.which", return_value="/usr/local/bin/codex"):
            _, healthy = report(self.config)

        self.assertFalse(healthy)

    def test_image_check_can_run_before_first_login(self):
        with patch.dict(
            os.environ,
            {
                "BOOTH_COLLECTOR_TOKEN": "t" * 32,
                "CODEX_HOME": str(Path(self.temporary.name) / "missing"),
            },
            clear=False,
        ), patch("doctor.shutil.which", return_value="/usr/local/bin/codex"):
            checks, healthy = report(self.config, require_auth=False)

        self.assertTrue(healthy)
        self.assertFalse(checks["codexLoginConfigured"])


if __name__ == "__main__":
    unittest.main()
