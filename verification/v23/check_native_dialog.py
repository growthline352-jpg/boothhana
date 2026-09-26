"""Actual Chromium dialog lifecycle, isolated DOM. No React/application/network."""
import json,pathlib,subprocess,os,shutil
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]; OUT=ROOT/'verification/v23/results'
SOURCE=pathlib.Path(os.getenv('BOOTHHANA_REVIEW_BASELINE',ROOT))
js=subprocess.check_output(['node','-e',"const fs=require('fs'),ts=require('./verification/v4/load_ts.cjs')();console.log(ts.transpileModule(fs.readFileSync('frontend/src/features/catalog/dialogLifecycle.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)"],cwd=SOURCE,text=True)
html='''<!doctype html><html><body style="overflow:auto"><main id="public-main" tabindex="-1"><button id="trigger">Open</button></main><dialog id="parent"><button id="initial">Close</button><button id="qr-trigger">QR</button><dialog id="qr"><button id="qr-close">Close QR</button></dialog></dialog></body></html>'''
r={'mode':'native Chromium HTMLDialogElement + real helper; isolated DOM, no React hydration/API', 'productionApproval':False,'checks':[]}
try:
 with sync_playwright() as p:
  launch={'headless':True,'args':['--no-sandbox']}
  executable=os.getenv('BOOTH_CHROMIUM_EXECUTABLE') or shutil.which('chromium')
  if executable: launch['executable_path']=executable
  browser=p.chromium.launch(**launch)
  page=browser.new_page();page.route('**/*',lambda route:route.abort())
  for mode in ['normal','parent-first','duplicate-cleanup']:
   page.set_content(html)
   page.add_script_tag(content='var exports={};'+js)
   data=page.evaluate('''mode=>{
    const by=id=>document.getElementById(id);
    const close=exports.openCatalogDialog(by('parent'),by('initial'),by('trigger'));
    const q=exports.openCatalogDialog(by('qr'),by('qr-close'),by('qr-trigger'));
    const before={focus:document.activeElement.id,lock:document.body.style.overflow};
    if(mode==='parent-first'){close();const middle={lock:document.body.style.overflow,focus:document.activeElement.id};q();return {before,middle,after:{lock:document.body.style.overflow,focus:document.activeElement.id},pass:middle.lock==='hidden'&&document.body.style.overflow==='auto'&&document.activeElement.id==='public-main'}}
    q();const middle={lock:document.body.style.overflow,focus:document.activeElement.id};close();if(mode==='duplicate-cleanup')close();return {before,middle,after:{lock:document.body.style.overflow,focus:document.activeElement.id},pass:middle.lock==='hidden'&&middle.focus==='qr-trigger'&&document.body.style.overflow==='auto'&&document.activeElement.id==='trigger'};
   }''',mode)
   data['case']=mode;r['checks'].append(data)
  browser.close()
 r['status']='PASS' if all(c['pass'] for c in r['checks']) else 'FAIL'
except Exception as e:r.update(status='NOT_READY',reason=str(e))
(OUT/('baseline-native-dialog.json' if SOURCE!=ROOT else 'native-dialog.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2))
print(json.dumps(r,ensure_ascii=False,indent=2))
raise SystemExit(0 if r['status']=='PASS' else 2)
