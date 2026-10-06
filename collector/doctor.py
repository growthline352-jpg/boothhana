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


def coverage_report(state_directory: Path) -> dict:
    """Report discovery freshness separately from executable/authentication health."""
    from discovery_work import DiscoveryWorkQueue
    from popup_inventory import InventoryState,elapsed
    from popup_catalog_sources import DIRECTORIES
    from regional_discovery import regional_jobs,typed_jobs
    state_directory=Path(state_directory)
    result={'scope':'SEOUL_GYEONGGI','regional':None,'officialPopups':None,'issues':[]}
    work=state_directory/'discovery-work-queue-v1.json'
    inventory=state_directory/'popup-source-state-v1.json'
    if work.exists():
        try:
            raw=json.loads(work.read_text(encoding='utf-8'))
            if raw.get('schemaVersion')!='1' or not isinstance(raw.get('jobs'),dict):raise ValueError('Invalid discovery state')
            freshness=DiscoveryWorkQueue(work).freshness()
            expected=len(regional_jobs({'startDate':'2000-01-01','endDate':'2000-01-02'}))
            result['regional']={'jobs':len(freshness),'regionalJobs':sum(r['kind']=='REGIONAL_SOURCE' for r in freshness),
                'typedJobs':sum(r['kind']=='TYPE_SOURCE' for r in freshness),'expectedTypedJobs':len(typed_jobs({'startDate':'2000-01-01','endDate':'2000-01-02'})),
                'expectedRegionalJobs':expected,'overdue':sum(r['overdue'] for r in freshness),
                'incomplete':sum(r['state'] not in ('COMPLETE','NO_RESULTS') for r in freshness),'sources':freshness}
            if result['regional']['regionalJobs']!=expected:result['issues'].append('Regional discovery grid is not fully initialized')
            if result['regional']['typedJobs']!=result['regional']['expectedTypedJobs']:result['issues'].append('Typed discovery jobs are not fully initialized')
        except (OSError,ValueError,KeyError,TypeError):result['issues'].append('Discovery state unreadable; review preserved file')
    else:result['issues'].append('Regional discovery has not initialized')
    if inventory.exists():
        try:
            state=InventoryState(inventory);branches=state.health()
            result['officialPopups']={'branches':len(branches),'overdue':sum(r['overdue'] for r in branches),
                'incomplete':sum(r['state']!='COMPLETE' for r in branches),'sources':branches,
                'unmappedBranches':sum(r.get('region') is None for r in state.branches().values())}
            stale=[key for key in DIRECTORIES if state.value['companies'].get(key,{}).get('state')!='COMPLETE' or elapsed(state.value['companies'].get(key,{}).get('lastSuccessAt'))>7*86400]
            result['officialPopups']['incompleteDirectories']=stale
            if stale:result['issues'].append('Some official company directories are uninitialized/stale/failed')
        except (OSError,ValueError,KeyError,TypeError):result['issues'].append('Official inventory state unreadable; review preserved file')
    else:result['issues'].append('Official popup inventory has not initialized')
    result['freshnessState']='PARTIAL' if result['issues'] or any(v is None or not v.get('jobs',v.get('branches')) or v['overdue'] or v['incomplete'] for v in (result['regional'],result['officialPopups'])) else 'CURRENT'
    return result


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
    parser.add_argument('--coverage',action='store_true',help='Also report stale/incomplete discovery sources without searches or DB writes.')
    parser.add_argument(
        "--skip-auth",
        action="store_true",
        help="Validate the image before the first interactive Codex login.",
    )
    args = parser.parse_args(argv)
    checks, healthy = report(args.config, require_auth=not args.skip_auth)
    coverage=coverage_report(Path(checks['stateDirectory']).expanduser()) if args.coverage else None
    print(json.dumps({"healthy": healthy, **checks, **({'collectionCoverage':coverage} if coverage else {})}, ensure_ascii=False, indent=2))
    return 1 if not healthy else 2 if coverage and coverage['freshnessState']!='CURRENT' else 0


if __name__ == "__main__":
    raise SystemExit(main())
