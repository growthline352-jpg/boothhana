"""New floorplan code checks; external service/runtime execution is separately opt-in."""
from pathlib import Path
import subprocess,tempfile,sys
ROOT=Path(__file__).resolve().parents[2]
def run(*args):subprocess.run(list(map(str,args)),cwd=ROOT,check=True)
def main():
 run('node',ROOT/'verification/v8/test_ui.cjs')
 run(sys.executable,ROOT/'verification/v8/compile_service.py')
 with tempfile.TemporaryDirectory() as tmp:
  p=ROOT/'backend/src/main/java/com/boothhana/floorplan'
  run('javac','-encoding','UTF-8','-d',tmp,*(p/n for n in ['FloorplanModels.java','FloorplanRules.java','FloorplanImageInfo.java']),ROOT/'verification/v8/FloorplanRulesTest.java')
  run('java','-cp',tmp,'FloorplanRulesTest')
 print('v8 isolated checks complete. Full Spring/React/DB/CLI/image recognition remain integration tests.')
if __name__=='__main__':main()
