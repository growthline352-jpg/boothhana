"""Native Chromium static-layout measurements; NOT an app/React/API E2E.
Uses set_content on a blank page, no localhost navigation or policy changes.
"""
import json, pathlib, os, shutil
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'verification/v23/results'; OUT.mkdir(exist_ok=True)
PREVIEW=ROOT/'preview/v23'
report={'mode':'real Chromium, static source JSX + CSS with synthetic data; no hydration/API', 'productionApproval':False,'checks':[]}
try:
 with sync_playwright() as p:
  launch={'headless':True,'args':['--no-sandbox']}
  executable=os.getenv('BOOTH_CHROMIUM_EXECUTABLE') or shutil.which('chromium')
  if executable: launch['executable_path']=executable
  browser=p.chromium.launch(**launch)
  page=browser.new_page()
  page.route('**/*',lambda route:route.abort())
  for name in ['discovery','detail','library','invalid-dates']:
   for width in [320,390,768,1280]:
    page.set_viewport_size({'width':width,'height':900})
    page.set_content((PREVIEW/f'{name}.html').read_text(),wait_until='domcontentloaded')
    metrics=page.evaluate('''() => ({
       width:innerWidth, scrollWidth:document.documentElement.scrollWidth,
       navVisible:!!document.querySelector('.public-mobile-nav')&&getComputedStyle(document.querySelector('.public-mobile-nav')).display!=='none',
       inputs:[...document.querySelectorAll('input:not([type="checkbox"]),select')].filter(n=>n.getBoundingClientRect().width).map(n=>({name:n.getAttribute('aria-label')||n.name||n.type,font:parseFloat(getComputedStyle(n).fontSize),height:n.getBoundingClientRect().height})),
       overflows:[...document.querySelectorAll('body *')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&getComputedStyle(n).position!=='absolute'&&(r.right>innerWidth+1||r.left< -1)&&!n.closest('.discovery-subcategories')}).slice(0,12).map(n=>({tag:n.tagName,cls:n.className,width:n.getBoundingClientRect().width})),
       mobileTargets:[...document.querySelectorAll('.public-mobile-nav>a')].map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}))
    })''')
    metrics.update(page=name,passed=metrics['scrollWidth']<=width)
    report['checks'].append(metrics)
    if width in [390,1280]:
     page.screenshot(path=str(PREVIEW/f'{name}-{width}.png'),full_page=True)
  browser.close()
 report['status']='PASS' if all(x['passed'] for x in report['checks']) else 'FAIL'
except Exception as e:
 report.update(status='NOT_READY',reason=str(e))
(OUT/'static-layout.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if report['status']=='PASS' else 2)
