"""Self-contained preview navigation smoke test, not production router verification."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,shutil
R=Path(__file__).resolve().parents[2];out=R/'verification/v10/results'
checks=[]
def ck(v,s):
 if not v:raise AssertionError(s)
 checks.append(s)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000});page.route('**/*',lambda r:r.abort());errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((R/'preview/v10/index.html').read_text(),wait_until='load')
 frame=page.frame_locator('#preview')
 frame.locator('.discovery-event-card').first.wait_for();ck(frame.locator('.discovery-event-card').count()==3,'offline gallery renders fake source cards')
 ck(frame.locator('.discovery-event-poster img').first.evaluate('(e)=>e.complete&&e.naturalWidth>0'),'embedded preview image loaded without networking')
 page.locator('#mobile').click();ck(page.locator('#preview').bounding_box()['width']==390,'gallery mobile width')
 frame.locator('.discovery-category-link').nth(1).click();page.wait_for_function("document.getElementById('views').value==='exhibitions'");ck(True,'preview category sends allowed view to wrapper')
 frame.locator('.discovery-theme-exhibitions').wait_for();ck(frame.get_by_role('heading',name='박람회 정보를 준비하고 있어요').count()==1 or frame.locator('.discovery-empty').count()>0,'exhibition placeholder shown')
 page.locator('#views').select_option('creator');frame.locator('.creator-task-card').first.wait_for();ck(frame.locator('.creator-task-card').count()==4,'creator preview accessible')
 page.locator('#views').select_option('drawer');frame.locator('dialog[open]').wait_for();ck(frame.get_by_role('button',name='판매정보 닫기').count()==1,'drawer accessible close')
 frame.get_by_role('button',name='판매정보 닫기').click();ck(frame.locator('dialog[open]').count()==0,'preview native close')
 page.locator('#views').select_option('home');frame.locator('.discovery-search input').wait_for();page.emulate_media(reduced_motion='reduce');ck(float(frame.locator('.discovery-search button').evaluate('(e)=>parseFloat(getComputedStyle(e).transitionDuration)'))<=.001,'reduced motion style')
 ck(not errors,'preview script errors absent')
 b.close()
(out/'gallery.json').write_text(json.dumps({'checks':checks,'scope':'Standalone static preview wrapper only, not production navigation.'},ensure_ascii=False,indent=2))
print(f'{len(checks)} offline gallery checks passed')
