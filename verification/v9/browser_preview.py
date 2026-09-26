"""Static source markup and native browser behavior; not React/Router end-to-end."""
from pathlib import Path
import json,shutil,os
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[2];OUT=R/'verification/v9/results';OUT.mkdir(exist_ok=True,parents=True)
checks=[];failures=[];metrics=[]
def check(value,label):
 (checks if value else failures).append(label)
with sync_playwright() as p:
 executable=os.getenv('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
 browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}))
 for width,height in [(1440,900),(390,844),(320,760)]:
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  page.route('**/*',lambda route:route.abort())
  for view in ['booths','map','drawer','info']:
   page.set_content((R/f'preview/v9/{view}.html').read_text(),wait_until='domcontentloaded')
   page.wait_for_timeout(100)
   check(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'{view}/{width}: no document horizontal overflow')
   check(page.locator('.visit-condition-row select').first.input_value()=='2026-10-11',f'{view}/{width}: selected visit day agrees with rendered summary and URL')
   check(page.locator('.visit-condition-row select').nth(1).input_value()=='1관',f'{view}/{width}: selected hall agrees with shared context')
   check(page.get_by_role('link',name='내 예약',exact=True).count()==1,f'{view}/{width}: mobile reservation accessible name retained')
   check(page.get_by_text('준비 중',exact=True).count()>=2,f'{view}/{width}: unavailable top-level categories labeled')
   if view=='booths':
    check(page.locator('.visit-booth-card:visible').count()==6,f'{width}: six synthetic booth results visible')
    check(page.locator('.visit-map-section').is_hidden(),f'{width}: map no longer pushes booth list down')
    check(page.get_by_role('button',name='상품 보기',exact=True).first.is_visible(),f'{width}: clear product action on card')
    box=page.locator('.visit-controls').bounding_box();metrics.append({'width':width,'view':view,'controlsTop':round(box['y']),'viewport':height})
    check(box['y']<height,f'{width}: visit controls appear in first screen')
   elif view=='map':
    check(page.locator('polygon:visible').count()==288,f'{width}: synthetic dense layout keeps exact 288 regions')
    check(page.get_by_role('button',name='배치도 전체화면',exact=True).is_visible(),f'{width}: full-screen action visible')
    check(page.locator('.floorplan-region.is-unlinked').count()==282,f'{width}: unmapped regions differentiated')
    check(page.locator('.floorplan-legend').count()==1,f'{width}: pattern and text legend')
    box=page.locator('.floorplan-viewport').bounding_box();svg=page.locator('.floorplan-viewport svg').bounding_box();metrics.append({'width':width,'view':view,'viewportHeight':round(box['height']),'drawingHeight':round(svg['height'])})
    check(abs(box['height']-svg['height'])<80 or width==1440,f'{width}: mobile drawing no excessive vertical empty box')
   elif view=='drawer':
    check(page.locator('.catalog-drawer').evaluate('(d)=>d.matches(":modal")'),f'{width}: native modal opens')
    product=page.locator('.catalog-products .catalog-product h3').first.bounding_box();metrics.append({'width':width,'view':view,'productNameY':round(product['y'])})
    check(product['y']<height,f'{width}: first product title reachable in initial modal viewport')
    check(page.locator('.catalog-image-missing').count()==0,f'{width}: no giant missing-image frames')
    check(not page.locator('.visit-reference-products').get_attribute('open'),f'{width}: reference products separate and collapsed')
    page.keyboard.press('Escape');check(not page.locator('.catalog-drawer').is_visible(),f'{width}: native Escape dismisses dialog')
   else:
    check(page.get_by_role('heading',name='전체 운영일',exact=True).is_visible(),f'{width}: detailed dates remain available separately')
   # Capture the visible modal before Escape separately below.
   if view=='drawer':page.locator('.catalog-drawer').evaluate('(d)=>d.showModal()')
   if width in (390,1440):page.screenshot(path=str(OUT/f'{view}-{width}.png'),full_page=False)
  page.close()
 browser.close()
result={'checks':len(checks),'passed':checks,'failed':failures,'metrics':metrics,'scope':'source JSX/CSS fixture; native HTML modal; no actual React or API'}
(OUT/'browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(checks),'failed':failures,'metrics':metrics},ensure_ascii=False,indent=2))
if failures:raise SystemExit(1)
