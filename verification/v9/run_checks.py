"""Focused UX regressions. Source/hook and pure Java tests; no real services."""
from pathlib import Path
import subprocess,tempfile
ROOT=Path(__file__).resolve().parents[2]
def main():
 for name in ['test_ux.cjs','test_pointer.cjs']:
  subprocess.run(['node',str(ROOT/'verification/v9'/name)],cwd=ROOT,check=True)
 with tempfile.TemporaryDirectory(prefix='v9-status-') as temp:
  src=ROOT/'backend/src/main/java/com/boothhana/collection'
  subprocess.run(['javac','-encoding','UTF-8','-d',temp,str(src/'CollectionModels.java'),str(src/'CollectionRules.java'),str(src/'VisitorGuideRules.java'),str(ROOT/'verification/v9/OperationStatusTest.java')],check=True)
  subprocess.run(['java','-cp',temp,'OperationStatusTest'],check=True)
 print('v9 isolated UX checks passed; full React/Spring/PostgreSQL/Codex/R2 integration is separate.')
if __name__=='__main__':main()
