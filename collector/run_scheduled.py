#!/usr/bin/env python3
"""Sunday: preserve 3-stage weekly batch, THEN independent floorplan work even if partial.
Uses subprocess argument arrays, existing private checkpoints/locks/auth isolation. No shell.
"""
from pathlib import Path
import argparse,os,subprocess,sys
ROOT=Path(__file__).resolve().parent

def run(config:Path|None,runner=subprocess.run,graph_config:Path|None=None):
    extra=['--config',str(config)] if config else []
    results=[]
    catalogue=['graph_worker.py','--config',str(graph_config),'--refresh'] if graph_config else ['weekly.py','--scheduled',*extra]
    for name,args in [('catalogue',catalogue),('floorplans',['floorplans.py',*extra])]:
        completed=runner([sys.executable,str(ROOT/args[0]),*args[1:]],cwd=ROOT,check=False)
        results.append(completed.returncode)
        print(f'{name} exit={completed.returncode}',flush=True)
    return 0 if results==[0,0] else 1 if any(x not in (0,2) for x in results) else 2
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',type=Path)
    p.add_argument('--graph-config',type=Path,default=os.getenv('BOOTH_COLLECTION_GRAPH_CONFIG'))
    args=p.parse_args();sys.exit(run(args.config,graph_config=args.graph_config))
