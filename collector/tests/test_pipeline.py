"""Actual runner subprocess + HTTP client against local fakes; no live search/production DB."""
from __future__ import annotations
from copy import deepcopy
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json,os,sys,tempfile,threading,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from run import main
from transport import send_batch,DeliveryError
ROOT=Path(__file__).resolve().parents[1]
SAMPLE=json.loads((ROOT/'examples/sample.json').read_text(encoding='utf-8'))
TOKEN='offline-test-token-'+'x'*40
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_POST(self):
        self.server.attempts+=1
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.server.bodies.append(body)
        code=self.server.codes.pop(0) if self.server.codes else 200
        self.send_response(code)
        if code==302: self.send_header('Location','http://127.0.0.1:9/leak')
        self.send_header('Content-Type','application/json');self.end_headers()
        if code==200:
            self.server.stored[body['runId']]=body
            status='FAILED' if body['result']['searchStatus']=='FAILED' else 'SUCCESS'
            self.wfile.write(json.dumps({'runId':body['runId'],'status':status,'inserted':len(body['result']['events']),'changed':0,'unchanged':0,'rejected':0,'rejections':[]}).encode())
        else: self.wfile.write(b'{}')

class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.dir=Path(self.temp.name)
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        self.server.attempts=0;self.server.codes=[];self.server.bodies=[];self.server.stored={}
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.base=f'http://127.0.0.1:{self.server.server_port}'
    def tearDown(self): self.server.shutdown();self.server.server_close();self.thread.join();self.temp.cleanup()
    def fake_cli(self,search=True,exit_code=0,bad_json=False):
        code="""#!/usr/bin/env python3
import sys,json,os
from pathlib import Path
assert 'BOOTH_COLLECTOR_TOKEN' not in os.environ
assert 'DATABASE_URL' not in os.environ
assert 'GOOGLE_APPLICATION_CREDENTIALS' not in os.environ
assert not (Path(os.environ['CODEX_HOME'])/'hooks.json').exists()
assert not (Path(os.environ['CODEX_HOME'])/'config.toml').read_text().find('mcp_servers')>=0
prompt=sys.stdin.read()
assert '서울특별시' in prompt and '2026-10-01' in prompt
output=Path(sys.argv[sys.argv.index('--output-last-message')+1])
"""
        code+=f'output.write_text({json.dumps(json.dumps(SAMPLE,ensure_ascii=False) if not bad_json else "invalid",ensure_ascii=False)},encoding="utf-8")\n'
        if search:code+='print(json.dumps({"type":"item.completed","item":{"type":"web_search"}}))\n'
        code+=f'sys.exit({exit_code})\n'
        script=self.dir/'codex-fake.py';script.write_text(code,encoding='utf-8')
        if os.name=='nt':
            fake=self.dir/'codex-fake.cmd';fake.write_text(f'@echo off\r\nset PYTHONUTF8=1\r\n"{sys.executable}" "{script}" %*\r\n',encoding='utf-8')
        else:
            fake=script;fake.chmod(0o700)
        auth=self.dir/'auth';auth.mkdir(exist_ok=True);(auth/'auth.json').write_text('{"offline":"test"}')
        (auth/'config.toml').write_text('mcp_servers.secret = true')
        cfg=self.dir/'config.json';cfg.write_text(json.dumps({'apiBaseUrl':self.base,'stateDirectory':str(self.dir/'state'),'codexExecutable':str(fake),'codexHome':str(auth)}))
        return cfg
    def execute(self,**kwargs):
        cfg=self.fake_cli(**kwargs)
        with patch.dict(os.environ,{'BOOTH_COLLECTOR_TOKEN':TOKEN,'DATABASE_URL':'must-not-leak','GOOGLE_APPLICATION_CREDENTIALS':'must-not-leak'}):
            result=main(['--config',str(cfg),'--month','2026-10'])
        return result,next((self.dir/'state/runs').glob('*/batch.json')),cfg
    def test_pipeline_success(self):
        result,batch,cfg=self.execute();self.assertEqual(result,0);self.assertEqual(self.server.attempts,1)
        value=json.loads(batch.read_text());self.assertTrue(value['webSearchObserved']);self.assertEqual(len(value['result']['events']),1)
        self.assertEqual(value,self.server.bodies[0]);self.assertTrue(batch.with_name('receipt.json').exists())
    def test_cli_without_web_audit_is_failed_not_empty_success(self):
        result,batch,cfg=self.execute(search=False);self.assertEqual(result,2)
        value=self.server.bodies[-1];self.assertEqual(value['result']['searchStatus'],'FAILED');self.assertEqual(value['result']['events'],[])
    def test_cli_nonzero_persists_failed_run(self):
        result,_,_=self.execute(exit_code=7);self.assertEqual(result,2);self.assertEqual(self.server.bodies[-1]['result']['searchStatus'],'FAILED')
    def test_bad_json_persists_failed_run(self):
        result,_,_=self.execute(bad_json=True);self.assertEqual(result,2);self.assertEqual(self.server.bodies[-1]['result']['events'],[])
    def test_retry_uses_same_run_id(self):
        result,batch,cfg=self.execute()
        # Simulate a committed server request whose response was lost locally.
        batch.with_name('receipt.json').unlink()
        with patch.dict(os.environ,{'BOOTH_COLLECTOR_TOKEN':TOKEN}): main(['--config',str(cfg),'--retry-batch',str(batch)])
        self.assertEqual(self.server.attempts,2);self.assertEqual(len(self.server.stored),1);self.assertEqual(self.server.bodies[0],self.server.bodies[1])
    def test_saved_receipt_keeps_the_completed_request_closed(self):
        result,batch,cfg=self.execute()
        original=json.loads(batch.read_text())
        with patch.dict(os.environ,{'BOOTH_COLLECTOR_TOKEN':TOKEN}): self.assertEqual(main(['--config',str(cfg),'--retry-batch',str(batch)]),0)
        self.assertEqual(self.server.attempts,1);self.assertEqual(len(self.server.stored),1)
        self.assertEqual(json.loads(batch.read_text()),original)
    def test_transient_retry_identical_payload(self):
        result,batch,cfg=self.execute();value=json.loads(batch.read_text());self.server.codes=[503,200]
        send_batch(self.base,TOKEN,value,sleep=lambda _:None)
        self.assertEqual(self.server.bodies[-1],self.server.bodies[-2])
    def test_redirect_not_followed(self):
        _,batch,_=self.execute();self.server.codes=[302]
        self.assertRaises(DeliveryError,send_batch,self.base,TOKEN,json.loads(batch.read_text()))
    def test_auth_error_not_retried(self):
        _,batch,_=self.execute();before=self.server.attempts;self.server.codes=[401]
        self.assertRaises(DeliveryError,send_batch,self.base,TOKEN,json.loads(batch.read_text()));self.assertEqual(self.server.attempts,before+1)
    def test_conflicting_id_not_retried(self):
        _,batch,_=self.execute();before=self.server.attempts;self.server.codes=[409]
        self.assertRaises(DeliveryError,send_batch,self.base,TOKEN,json.loads(batch.read_text()));self.assertEqual(self.server.attempts,before+1)
if __name__=='__main__': unittest.main(verbosity=2)
