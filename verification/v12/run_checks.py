"""v12 standalone, no actual DB/network/auth/storage. External framework types are explicit stubs."""
from pathlib import Path
import subprocess,tempfile,sys
R=Path(__file__).resolve().parents[2]
def run(*args):
 print('RUN',' '.join(map(str,args)),flush=True);subprocess.run(list(map(str,args)),check=True,cwd=R)
def main():
 J=R/'backend/src/main/java/com/boothhana'
 with tempfile.TemporaryDirectory(prefix='v12-pure-') as d:
  run('javac','-encoding','UTF-8','-d',d,J/'support/SupportModels.java',J/'support/SupportRules.java',J/'security/LoginReturnPath.java',J/'service/ApplicationRules.java',R/'verification/v12/RulesTest.java')
  run('java','-cp',d,'RulesTest')
  run('javac','-encoding','UTF-8','-d',d,R/'verification/v4/JavaSyntaxCheck.java')
  run('java','-cp',d,'JavaSyntaxCheck',*sorted((R/'backend/src').rglob('*.java')))
 run(sys.executable,R/'verification/v12/check_java_contracts.py')
 run('node',R/'verification/v12/test_support_ui.cjs')
 run('node',R/'verification/v12/check_types.cjs')
 run('node',R/'verification/v4/check_ts.cjs')
 print('PASS v12 isolated checks. PostgreSQL/RLS/private R2/Kakao/React/Spring HTTP/transactions are NOT executed.')
if __name__=='__main__':main()
