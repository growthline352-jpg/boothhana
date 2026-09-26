"""Real native dialog/DOM checks on source-rendered fixtures; no React/router/backend runtime."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import io,json,os,shutil
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2];out=ROOT/'verification/v7/results';checks=[]
def check(value,label):
    assert value,label
    checks.append(label)
image=Image.new('RGB',(600,300),'white');draw=ImageDraw.Draw(image)
for i in range(5):
    draw.rectangle((30+i*110,60,110+i*110,240),outline='black',width=2);draw.text((55+i*110,135),f'B{i+1}',fill='black')
draw.text((210,20),'TEST FLOOR PLAN',fill='black');buf=io.BytesIO();image.save(buf,format='PNG')
with sync_playwright() as p:
    executable=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
    browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}))
    page=browser.new_page()
    page.route('https://fixture.test/**',lambda route:route.fulfill(body=buf.getvalue(),content_type='image/png') if route.request.url.endswith('.png') else route.abort())
    page.set_content((out/'browser-fixture.html').read_text(),wait_until='load')
    for width,height in [(1440,900),(390,844),(320,760)]:
        page.set_viewport_size({'width':width,'height':height})
        check(page.locator('.catalog-floor-plans img').count()==1,f'{width}: event map has its own rendered section')
        check('가상 1홀' in page.locator('.catalog-floor-plans').inner_text(),f'{width}: map explicit hall context shown')
        check(page.locator('.catalog-floor-plans a').first.get_attribute('target')=='_blank',f'{width}: map opens full image separately')
        check(page.locator('a.discovery-reservations').get_attribute('aria-label')=='내 예약',f'{width}: icon reservation name preserved')
        check('내 예약' in page.locator('a.discovery-reservations').aria_snapshot(),f'{width}: Chromium AX tree includes reservation name')
        origin=page.locator('.catalog-booth-card').first;origin.scroll_into_view_if_needed();origin.focus();origin.click()
        dialog=page.locator('dialog');check(dialog.is_visible(),f'{width}: dialog immediately visible despite 80-booth list')
        check(page.evaluate("document.querySelector('dialog').matches(':modal')"),f'{width}: true native modal not static open attribute')
        box=dialog.bounding_box();check(box['y']>=0 and box['y']<5 and box['height']<=height+1,f'{width}: drawer positioned in viewport')
        check(page.evaluate("document.activeElement.id==='catalog-booth-title-1'"),f'{width}: initial focus at readable heading')
        check(page.evaluate("document.body.style.overflow==='hidden'"),f'{width}: background scroll locked')
        for _ in range(12):page.keyboard.press('Tab')
        check(page.evaluate("document.querySelector('dialog').contains(document.activeElement)"),f'{width}: keyboard focus remains inside modal')
        check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),f'{width}: no horizontal overflow')
        if width in (1440,390):
            page.evaluate("document.querySelector('dialog h2').focus({preventScroll:true});document.querySelector('dialog').scrollTop=0")
            page.screenshot(path=str(out/f'drawer-{width}.png'),full_page=False)
        page.keyboard.press('Escape');check(page.locator('dialog').count()==0,f'{width}: Escape closes and removes modal')
        check(page.evaluate("document.activeElement===document.querySelector('.catalog-booth-card')"),f'{width}: close returns focus to origin')
        check(page.evaluate("document.body.style.overflow!== 'hidden'"),f'{width}: background scroll restored')
        origin.click();page.locator('dialog').get_by_role('button',name='판매정보 닫기').click()
        check(page.locator('dialog').count()==0,f'{width}: explicit close also cleans up')
    browser.close()
report={'scope':'Source-rendered static DOM and actual dialogLifecycle TS function. Not React state/effects E2E. Dummy map/products only.','checks':len(checks),'passed':checks}
(out/'browser-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(checks),'scope':report['scope']},ensure_ascii=False))
