#!/usr/bin/env python3
"""Chromium static-preview checks, NOT a React app or API integration test."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, sys
file = Path(sys.argv[1]).resolve()
out = Path(__file__).parent / 'results'
checks = []
def check(value, name):
    assert value, name
    checks.append(name)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1440,'height':1040},device_scale_factor=1)
    page.set_content(file.read_text(), wait_until='load');page.wait_for_selector('h1')
    for key,title in [('subculture','서브컬처'),('exhibitions','박람회'),('festivals','축제')]:
        page.locator('.discovery-category-nav').get_by_text(title,exact=True).click()
        page.wait_for_timeout(120)
        check(page.locator('.discovery-category-link[aria-current=page]').count()==1,key+' unique current navigation')
        check(page.locator('#discovery-heading').inner_text()==title+' 둘러보기',key+' distinct category heading')
        check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),key+' desktop no horizontal overflow')
        check(page.locator('.discovery-event-card').count()==(3 if key=='subculture' else 0),key+' no cross-category mock data')
        page.screenshot(path=str(out/f'{key}-desktop.png'),full_page=True)
    for width in (390,320,768):
        page.set_viewport_size({'width':width,'height':844})
        for key,title in [('subculture','서브컬처'),('exhibitions','박람회'),('festivals','축제')]:
            page.locator('.discovery-category-nav').get_by_text(title,exact=True).click();page.wait_for_timeout(100)
            check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),f'{width}px {key} no horizontal overflow')
            for link in page.locator('.discovery-category-link').all():
                box=link.bounding_box();check(box is not None and box['height']>=44,f'{width}px {key} navigation target >=44px')
            if width==390:page.screenshot(path=str(out/f'{key}-mobile.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.locator('.discovery-menu summary').focus();page.keyboard.press('Enter')
    check(page.locator('.discovery-menu').get_attribute('open') is not None,'keyboard opens native service menu')
    check(page.locator('.discovery-menu-panel').get_by_text('플랫폼 운영 행사',exact=False).is_visible(),'operating events still available in menu')
    page.keyboard.press('Escape');check(page.locator('.discovery-menu').get_attribute('open') is None,'escape closes preview menu')
    page.evaluate("location.hash='subculture'");page.wait_for_timeout(100)
    page.screenshot(path=str(out/'subculture-mobile.png'),full_page=True)
    browser.close()
report={'scope':'Chromium static mock HTML derived from source JSX/CSS. Not React DOM/Router or backend runtime.', 'checks':len(checks),'passed':checks,'sample_data':True}
(out/'browser-preview.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(checks),'scope':report['scope']},ensure_ascii=False))
