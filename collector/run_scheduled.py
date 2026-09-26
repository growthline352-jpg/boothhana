#!/usr/bin/env python3
"""Sunday: preserve 3-stage weekly batch, THEN independent floorplan work even if partial.
Uses subprocess argument arrays, existing private checkpoints/locks/auth isolation. No shell.
"""
from pathlib import Path
import argparse,subprocess,sys
ROOT=Path(__file__).resolve().parent

def run(config:Path|None,runner=subprocess.run):
    extra=['--config',str(config)] if config else []
    results=[]
    for name,args in [('catalogue',['weekly.py','--scheduled']),('floorplans',['floorplans.py'])]:
        completed=runner([sys.executable,str(ROOT/args[0]),*args[1:],*extra],cwd=ROOT,check=False)
        results.append(completed.returncode)
        print(f'{name} exit={completed.returncode}',flush=True)
    return 0 if results==[0,0] else 1 if any(x not in (0,2) for x in results) else 2
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',type=Path)
    sys.exit(run(p.parse_args().config))
