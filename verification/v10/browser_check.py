"""Static source-rendered DOM verification; not React/Router/API E2E."""
from pathlib import Path
import json,mimetypes,shutil
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[2];OUT=R/'verification/v10/results';OUT.mkdir(parents=True,exist_ok=True)
checks=[];failures=[];metrics=[]
def check(value,label):
 (checks if value else failures).append(label)
def handle(route):
 u=urlparse(route.request.url)
 if u.hostname=='preview.boothhana.test' and u.path.startswith('/assets/'):
  file=R/'frontend/public/assets'/('brand/logo.png' if u.path.endswith('/logo.png') else 'boothup/'+Path(u.path).name)
  if file.is_file():route.fulfill(status=200,content_type=mimetypes.guess_type(str(file))[0],body=file.read_bytes());return
 route.abort()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for width,height in [(1440,1000),(768,1024),(390,844),(320,760)]:
  for name in ['home','booths','map','drawer','info','exhibitions','festivals','empty','error','admin','creator','products','event-form','product-form']:
   page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
   page.set_default_timeout(3000)
   page.route('**/*',handle)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.set_content((R/f'preview/v10/{name}.html').read_text(),wait_until='networkidle')
   check(not errors,f'{name}/{width}: preview glue has no JS error')
   check(page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),f'{name}/{width}: no page horizontal overflow')
   if name not in ['admin','creator','products','event-form','product-form']:
    check(page.locator('.discovery-category-link:visible').count()==3,f'{name}/{width}: 3 category navigation links visible')
    # A modal correctly makes the background link inaccessible to assistive tech.
    if name!='drawer':check(page.get_by_role('link',name='내 예약',exact=True).count()==1,f'{name}/{width}: reservation link accessible name')
   else:
    check(page.get_by_role('main').count()==1,f'{name}/{width}: console main landmark')
    check(page.locator('.console-main h1').count()==1,f'{name}/{width}: single task title')
   if name in ['booths','map','drawer','info']:
    check(page.locator('.visit-condition-row select').first.input_value()=='2026-10-11',f'{name}/{width}: visit date value retained')
    check(page.locator('.visit-condition-row select').nth(1).input_value()=='1관',f'{name}/{width}: hall value retained')
   if name=='home':
    check(page.locator('.discovery-event-card').count()==3,f'home/{width}: three fictional cards')
    check(page.locator('.discovery-hero input').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)>=16'),f'home/{width}: search input 16px or larger')
    check(page.locator('.discovery-search button').bounding_box()['height']>=44,f'home/{width}: search button minimum 44px height')
   if name=='drawer':
    check(page.locator('.catalog-drawer').evaluate('(e)=>e.open'),f'drawer/{width}: native modal open')
    check(page.locator('.catalog-product h3').first.is_visible(),f'drawer/{width}: product title visible')
    check(page.get_by_role('button',name='판매정보 닫기').bounding_box()['height']>=44,f'drawer/{width}: close touch area')
   if name=='creator':
    check(page.locator('.creator-task-card').count()==4,f'creator/{width}: 4 existing destinations')
    check(page.locator('.metric-grid').count()==0,f'creator/{width}: fake metric placeholders removed')
   if name=='admin':
    check(page.locator('.collection-process').count()==1,f'admin/{width}: collection/review process visible')
    check(page.locator('tbody tr').count()==3,f'admin/{width}: fictional table rows retained')
   if name in ['event-form','product-form']:
    check(page.locator('form').count()==1,f'{name}/{width}: form preserved')
    check(page.locator('input.input').first.evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)>=16'),f'{name}/{width}: form inputs 16px')
    check(page.locator('form .btn.primary').bounding_box()['height']>=44,f'{name}/{width}: save button 44px')
   if name=='map':
    check(page.locator('.floorplan-region').count()==288,f'map/{width}: shape count unchanged')
   if width in [1440,390] and name in ['home','booths','map','drawer','admin','creator','products','exhibitions','festivals','event-form','product-form']:
    page.screenshot(path=str(OUT/f'{name}-{width}.png'),full_page=name not in ['drawer','map'])
   small=page.locator('body').evaluate('''e=>[...e.querySelectorAll('button,a,input,select')].filter(x=>x.getClientRects().length&&!x.closest('.preview-bar')&&getComputedStyle(x).visibility!=='hidden').map(x=>({tag:x.tagName,text:(x.innerText||x.getAttribute('aria-label')||'').slice(0,32),width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height,font:parseFloat(getComputedStyle(x).fontSize)})).filter(x=>x.font<12)''')
   metrics.append({'page':name,'width':width,'tiny_controls':small})
   page.close()
 browser.close()
(OUT/'browser.json').write_text(json.dumps({'checks':checks,'failures':failures,'metrics':metrics,'scope':'Source JSX/CSS + preview-only JS in Chromium. NOT live React app.'},ensure_ascii=False,indent=2))
print(f'{len(checks)} passed; {len(failures)} failures')
for f in failures:print('FAIL',f)
raise SystemExit(bool(failures))
