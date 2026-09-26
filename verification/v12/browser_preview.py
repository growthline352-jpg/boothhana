"""Checks source-generated static HTML only. No React effects/router/auth/API execution."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[2];out=R/'verification/v12/results';out.mkdir(exist_ok=True)
checks=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(1440,1000),(390,844),(320,800)]:
  for name in ['center','inquiry','my-report','admin-report','admin-inquiries','guest']:
   page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
   page.route('**/*',lambda route:route.abort())
   page.set_content((R/f'preview/v12/{name}.html').read_text(),wait_until='domcontentloaded')
   overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
   assert not overflow,(name,width,'horizontal overflow')
   assert page.locator('h1').count()==1,(name,'one page title')
   checks += [f'{name}/{width}: no document horizontal overflow',f'{name}/{width}: one page title']
   if name=='my-report':
    assert '[가상 내부 메모]' not in page.inner_text('body');checks.append(f'{name}/{width}: requester fixture has no internal note')
   if name=='admin-report':
    assert '관리자 내부 메모' in page.inner_text('body');checks.append(f'{name}/{width}: admin note visibly labeled')
   if name in ['inquiry','guest']:
    assert page.locator('textarea[required]').count()>0
    assert page.locator('input[required]').count()>0
    checks.append(f'{name}/{width}: required fields present')
   if width in [390,1440] and name in ['center','inquiry','my-report','admin-report']:
    page.screenshot(path=str(out/f'{name}-{width}.png'),full_page=True)
   page.close()
 browser.close()
(out/'browser.json').write_text(json.dumps({'kind':'static source HTML, synthetic data, not full E2E','checks':len(checks),'details':checks},ensure_ascii=False,indent=2))
print(f'PASS {len(checks)} static browser layout/content checks; no real React/API/auth interactions.')
