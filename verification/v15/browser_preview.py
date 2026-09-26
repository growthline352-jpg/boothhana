"""Static real-source JSX/CSS preview; NOT React, router, real API, authentication, or persistence."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'verification/v15/results';OUT.mkdir(exist_ok=True,parents=True)
checks=[]
def check(name,yes):
 checks.append({'name':name,'passed':bool(yes)})
 if not yes:raise AssertionError(name)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for mode in ['index','guest','empty']:
  for width in [1440,768,390,320]:
   page=browser.new_page(viewport={'width':width,'height':900 if width>600 else 844},device_scale_factor=1)
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.set_content((ROOT/f'preview/v15/{mode}.html').read_text(),wait_until='load');page.wait_for_timeout(120)
   check(f'{mode}-{width} no horizontal document overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
   check(f'{mode}-{width} header named collection link',page.get_by_role('link',name='내 보관함',exact=True).count()>=1)
   check(f'{mode}-{width} title',page.get_by_role('heading',name='내 보관함',exact=True).count()==1)
   check(f'{mode}-{width} not a real data or API claim',page.locator('.preview-note').inner_text().find('가상 데이터')>=0)
   if mode=='empty':check(f'{mode}-{width} useful empty state',page.get_by_text('기억하고 싶은 곳을 하나 저장해 보세요.').is_visible())
   else:
    card=page.locator('.memory-card').first;btn=card.get_by_role('button',name='메모·방문 기록');btn.click()
    d=page.locator('dialog[open]');check(f'{mode}-{width} record opens',d.count()==1)
    check(f'{mode}-{width} private-note edit',d.locator('textarea').count()==1)
    check(f'{mode}-{width} name has focus',d.locator('h2').evaluate('(el)=>el===document.activeElement'))
    check(f'{mode}-{width} no inferred visit claim',d.get_by_text('저장·QR 열람·페이지 조회만으로 방문 표시하지 않습니다.').count()==1)
    check(f'{mode}-{width} dialog fits viewport',d.evaluate('(el)=>{const r=el.getBoundingClientRect();return r.width<=innerWidth&&r.height<=innerHeight+2}'))
    if mode=='index' and width in (1440,390):page.screenshot(path=str(OUT/f'note-{width}.png'),full_page=False)
    page.keyboard.press('Escape');check(f'{mode}-{width} Escape closes',page.locator('dialog[open]').count()==0);check(f'{mode}-{width} focus returns',btn.evaluate('(el)=>el===document.activeElement'))
   check(f'{mode}-{width} no script errors',not errors)
   page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(100)
   if width in (1440,390):page.screenshot(path=str(OUT/f'{mode}-{width}.png'),full_page=True)
   page.close()
 browser.close()
(OUT/'browser.json').write_text(json.dumps({'scope':'Static JSX/CSS + preview-only dialog wiring, not real React app','checks':checks,'passed':len(checks)},ensure_ascii=False,indent=2)+'\n')
print('PASS',len(checks),'static layout/native-dialog conditions; actual React/API/mobile touch NOT tested.')
