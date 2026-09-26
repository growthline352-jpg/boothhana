"""Chromium on source-rendered static HTML. DOM adapter only, not React/API E2E."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[2];out=R/'verification/v11/results';out.mkdir(exist_ok=True)
checks=[]
def ok(value,label):
    assert value,label
    checks.append(label)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width in (1440,768,390,320):
        page=browser.new_page(viewport={'width':width,'height':920 if width>500 else 844},reduced_motion='reduce')
        page.set_content((R/'preview/v11/home.html').read_text(),wait_until='load')
        rail=page.locator('.goods-rail');rail.scroll_into_view_if_needed()
        ok(page.locator('.goods-slide').count()==8,f'{width}: 8 fictional goods, no silent replacement')
        ok(page.locator('.goods-section').get_by_role('heading',name='많이 판매된 굿즈').count()==1,f'{width}: named section')
        ok(page.get_by_role('button',name='이전 굿즈 보기').is_disabled(),f'{width}: previous disabled at start')
        ok(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'{width}: no document horizontal overflow')
        page.get_by_role('button',name='다음 굿즈 보기').click();page.wait_for_timeout(120)
        ok(rail.evaluate('e=>e.scrollLeft>0'),f'{width}: static adapter next scroll')
        rail.focus();page.keyboard.press('ArrowLeft');page.wait_for_timeout(120)
        ok(rail.evaluate('e=>e.scrollLeft')<100,f'{width}: static keyboard back')
        left=rail.evaluate('e=>e.scrollLeft');page.wait_for_timeout(180);ok(abs(rail.evaluate('e=>e.scrollLeft')-left)<1,f'{width}: no automatic rotation')
        ok(page.get_by_role('link',name='6위 밤산책 캔배지',exact=False).count()==1,f'{width}: named ranked product')
        ok(page.locator('.goods-stock').count()==1,f'{width}: sold-out visible')
        page.get_by_text('어떤 기준으로 집계하나요?',exact=True).click();ok(page.get_by_text('결제 검증된 전체 시장 순위가 아니라',exact=False).is_visible(),f'{width}: metric limitation visible')
        page.screenshot(path=str(out/f'goods-{width}.png'),full_page=False)
        if width in (1440,390):
            page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(out/f'home-{width}.png'),full_page=True)
        page.close()
    for width in (1440,390):
        page=browser.new_page(viewport={'width':width,'height':900})
        page.set_content((R/'preview/v11/map.html').read_text(),wait_until='load')
        dialog=page.get_by_role('dialog');ok(dialog.count()==1 and dialog.is_visible(),f'{width}: one native map dialog')
        action=dialog.locator('[data-floorplan-details]').first
        ok(action.is_visible(),f'{width}: selection action inside modal')
        page.locator('.floorplan-viewport').evaluate('e=>e.scrollTop=30')
        before=page.locator('.floorplan-viewport').evaluate('e=>e.scrollTop')
        action.click();ok(dialog.get_by_role('heading',name='달토끼공방',exact=False).count()>=1,f'{width}: booth name in details')
        ok(page.locator('.floorplan-full-map').evaluate('e=>e.inert'),f'{width}: map inert behind detail')
        page.screenshot(path=str(out/f'fullscreen-detail-{width}.png'),full_page=False)
        page.keyboard.press('Escape');ok(dialog.is_visible(),f'{width}: first escape keeps map dialog')
        ok(not page.locator('.floorplan-full-map').evaluate('e=>e.inert'),f'{width}: map interactive again')
        ok(page.locator('.floorplan-viewport').evaluate('e=>e.scrollTop')==before,f'{width}: map scroll preserved in static DOM')
        ok(action.evaluate('e=>e===document.activeElement'),f'{width}: focus restored to selection action')
        page.keyboard.press('Escape');ok(not dialog.is_visible(),f'{width}: second escape closes native dialog')
        page.close()
    browser.close()
(out/'browser.json').write_text(json.dumps({'scope':'source-rendered static DOM + explicit preview adapter, NOT React E2E','count':len(checks),'checks':checks},ensure_ascii=False,indent=2))
print(f'PASS: {len(checks)} Chromium static preview assertions; not React/real sales/DB.')
