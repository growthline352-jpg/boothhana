#!/usr/bin/env python3
"""Validate the production collector runtime without performing a search or DB write."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys

from weekly import load_config


def report(config_path: Path, *, require_auth: bool = True) -> tuple[dict, bool]:
    cfg = load_config(config_path)
    token = os.getenv(cfg["tokenEnv"], "").strip()
    auth_file = Path(os.getenv("CODEX_HOME", str(Path.home() / ".codex"))) / "auth.json"
    checks = {
        "python": sys.version.split()[0],
        "codexExecutable": cfg["codexExecutable"],
        "codexFound": bool(shutil.which(cfg["codexExecutable"])),
        "codexLoginConfigured": auth_file.is_file(),
        "collectorTokenConfigured": len(token) >= 32,
        "apiBaseUrl": cfg["apiBaseUrl"],
        "stateDirectory": cfg["stateDirectory"],
        "imageAllowedHostCount": len(cfg["imageAllowedHosts"]),
    }
    required = ["codexFound", "collectorTokenConfigured"]
    if require_auth:
        required.append("codexLoginConfigured")
    healthy = all(checks[key] for key in required)
    return checks, healthy


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument(
        "--skip-auth",
        action="store_true",
        help="Validate the image before the first interactive Codex login.",
    )
    args = parser.parse_args(argv)
    checks, healthy = report(args.config, require_auth=not args.skip_auth)
    print(json.dumps({"healthy": healthy, **checks}, ensure_ascii=False, indent=2))
    return 0 if healthy else 1


if __name__ == "__main__":
    raise SystemExit(main())
