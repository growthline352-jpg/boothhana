"""Run the real JS transport with isolated fake tabs; never a live browser."""
import shutil,subprocess,unittest
from pathlib import Path

@unittest.skipUnless(shutil.which('node'),'Node runtime required for bridge protocol')
class BrowserBridgeProtocolTests(unittest.TestCase):
 def test_public_capture_protocol(self):
  result=subprocess.run([shutil.which('node'),'--test',str(Path(__file__).with_name('browser_capture_bridge.test.mjs'))],capture_output=True,text=True,timeout=30)
  self.assertEqual(0,result.returncode,result.stdout+result.stderr)
