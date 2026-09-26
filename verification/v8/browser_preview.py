"""Chromium static source-SVG layout + native dialog test. NOT full React E2E."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import shutil,json,os
R=Path(__file__).resolve().parents[2];out=R/'verification/v8/results';checks=[]
def check(v,s):
 assert v,s
 checks.append(s)
with sync_playwright() as p:
 executable=os.getenv('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
 browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}))
 page=browser.new_page();page.set_content((R/'preview/floorplan-v8.html').read_text(),wait_until='load')
 for w,h in [(1440,900),(390,844),(320,760)]:
  page.set_viewport_size({'width':w,'height':h})
  check(page.locator('svg polygon').count()==4,f'{w}: four fixture polygons')
  check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{w}: no page overflow')
  check(page.locator('svg image').evaluate('(i)=>i.getAttribute("href").startsWith("data:image/png")'),f'{w}: original embedded')
  page.get_by_role('button',name='배치도 확대',exact=True).click();check(page.locator('output').inner_text()=='150%',f'{w}: preview zoom')
  page.get_by_role('button',name='초기화',exact=True).click();check(page.locator('output').inner_text()=='100%',f'{w}: reset')
  booth=page.get_by_role('button',name='부스 B1',exact=True);booth.focus();page.keyboard.press('Enter');check(page.locator('dialog').is_visible(),f'{w}: keyboard opens native drawer')
  check(page.evaluate('document.querySelector("dialog").matches(":modal")'),f'{w}: modal')
  page.keyboard.press('Escape');check(not page.locator('dialog').is_visible(),f'{w}: escape')
  check(page.evaluate('document.activeElement.classList.contains("floorplan-viewport")'),f'{w}: focus returns to map')
  page.screenshot(path=str(out/f'floorplan-{w}.png'),full_page=False)
 browser.close()
(out/'browser.json').write_text(json.dumps({'checks':len(checks),'passed':checks,'scope':'static source SVG + preview glue + actual native dialog lifecycle; not React app E2E'},ensure_ascii=False,indent=2))
print(f'PASS {len(checks)} static Chromium checks')
