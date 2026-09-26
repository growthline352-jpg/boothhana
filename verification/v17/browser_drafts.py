#!/usr/bin/env python3
"""Real built React + Chromium; all APIs are intercepted fixtures, never real accounts.
Requires frontend/dist and Playwright 1.57.0 with Chromium. Missing prerequisites FAIL.
No npm package substitutions, no real OAuth/database/R2/Codex, no production approval.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from urllib.parse import urlsplit, unquote
import asyncio, hashlib, json, threading, sys
ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'verification/v17/results/browser-drafts.json'

class SpaHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        # Existing assets use SimpleHTTPRequestHandler's normal safe path handling.
        path = unquote(urlsplit(self.path).path)
        candidate = Path(self.directory, path.lstrip('/'))
        if not candidate.is_file() and '.' not in Path(path).name:
            self.path = '/index.html'
        return super().do_GET()

async def run(dist):
    from playwright.async_api import async_playwright, expect
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SpaHandler, directory=str(dist)))
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    passed = []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            try:
                async def scenario(path, field, open_button=None):
                    context = await browser.new_context(service_workers='block')
                    page = await context.new_page()
                    identity = {'id': 701, 'displayName': '격리 테스트', 'permissions': ['ADMIN', 'CREATOR', 'FAN']}
                    me_ready, save_ready, save_started = asyncio.Event(), asyncio.Event(), asyncio.Event()
                    me_ready.set(); save_ready.set()
                    state = {'auth_status': 200, 'saves': 0, 'unexpected': [], 'page_errors': []}
                    page.on('pageerror', lambda error: state['page_errors'].append(str(error)))
                    async def fixture(route):
                        req = route.request; url = urlsplit(req.url); endpoint = url.path
                        if not endpoint.startswith('/api/'):
                            if req.url.startswith(origin + '/'):
                                await route.continue_(); return
                            state['unexpected'].append(endpoint); await route.abort(); return
                        if req.method == 'OPTIONS':
                            await route.fulfill(status=204, headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'content-type,x-xsrf-token','Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS'}); return
                        status, body = 200, []
                        if endpoint == '/api/me':
                            await me_ready.wait(); status = state['auth_status']
                            body = dict(identity) if status == 200 else {'status':status,'code':'TEST','message':'fixture'}
                        elif endpoint == '/api/auth/csrf': body = {'token':'isolated-browser-fixture'}
                        elif endpoint == '/api/me/library/index': body = []
                        elif endpoint in ['/api/creator/booths','/api/creator/event-booths','/api/admin/events'] or endpoint.endswith('/products'):
                            if req.method in ['POST','PATCH']:
                                state['saves'] += 1; save_started.set(); await save_ready.wait(); body = {'id':9101}
                        else:
                            state['unexpected'].append(endpoint); status = 500; body = {'status':500,'code':'UNEXPECTED_FIXTURE','message':'unexpected endpoint'}
                        await route.fulfill(status=status, json=body, headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'})
                    await context.route('**/*', fixture)
                    try:
                        await page.goto(origin + path)
                        if open_button: await page.get_by_role('button', name=open_button, exact=True).click()
                        control = page.get_by_label(field, exact=True)
                        await control.fill('초안-외부탭-복원')
                        async def recheck():
                            me_ready.clear()
                            await page.evaluate("window.dispatchEvent(new Event('focus'))")
                            await expect(page.get_by_role('heading', name='계정을 확인하고 있습니다')).to_be_visible()
                            await expect(control).to_have_count(0)
                            me_ready.set()
                        await recheck()
                        await expect(control).to_have_value('초안-외부탭-복원')
                        passed.append(path + ': same-account focus restores draft without exposing during check')
                        # Account B cannot inherit A's edits. A returning later must not recover the discarded epoch.
                        identity['id'] = 702; await recheck()
                        if open_button:
                            await expect(control).to_have_count(0)
                            await page.get_by_role('button', name=open_button, exact=True).click()
                        await expect(control).to_have_value('')
                        identity['id'] = 701; await recheck()
                        if open_button:
                            await expect(control).to_have_count(0)
                            await page.get_by_role('button', name=open_button, exact=True).click()
                        await expect(control).to_have_value('')
                        passed.append(path + ': account A-B-A never revives a stale draft')
                        await control.fill('전송 대기 초안')
                        if path.startswith('/admin'):
                            await page.get_by_label('장소', exact=True).fill('격리 테스트 장소')
                            await page.get_by_label('행사 시작', exact=True).fill('2027-01-01T10:00')
                            await page.get_by_label('행사 종료', exact=True).fill('2027-01-01T18:00')
                            button = page.get_by_role('button', name='행사 저장', exact=True)
                        else:
                            button = page.get_by_role('button', name='상품 저장' if field == '상품명' else '변경 저장', exact=True)
                        save_ready.clear(); await button.click()
                        await asyncio.wait_for(save_started.wait(),timeout=10)
                        await expect(page.get_by_role('button', name='저장 중…', exact=True)).to_be_disabled()
                        await recheck()
                        await expect(page.get_by_role('button', name='저장 중…', exact=True)).to_be_disabled()
                        assert state['saves'] == 1, 'Duplicate create across revalidation'
                        save_ready.set()
                        await expect(page.get_by_text('저장이 완료되었습니다. 목록에서 결과를 확인해 주세요.', exact=True)).to_be_visible()
                        passed.append(path + ': in-flight create stays locked across remount')
                        state['auth_status'] = 401; await recheck()
                        await expect(page.get_by_role('heading', name='로그인이 필요합니다')).to_be_visible()
                        assert not state['unexpected'], f"Unmocked endpoints: {state['unexpected']}"
                        assert not state['page_errors'], f"Browser runtime errors: {state['page_errors']}"
                        passed.append(path + ': 401 clears protected UI')
                    finally:
                        me_ready.set(); save_ready.set(); await context.close()
                await scenario('/admin/events/new', '행사명')
                await scenario('/creator/event-booths/71/products', '상품명', '상품 등록')
                await scenario('/creator/booths', '부스명', '새 부스')
            finally: await browser.close()
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=5)
    return passed

def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    report = {'state':'NOT_READY', 'productionApproval':False, 'scope':'real built React/Chromium, fixture APIs only', 'passed':[]}
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    try:
        dist = ROOT / 'frontend/dist'
        if not (dist/'index.html').is_file() or not list((dist/'assets').glob('*.js')):
            raise RuntimeError('Build frontend with the frozen lockfile before running this browser test')
        report['buildHtmlSha256'] = hashlib.sha256((dist/'index.html').read_bytes()).hexdigest()
        report['passed'] = asyncio.run(run(dist)); report['state'] = 'REAL_BROWSER_FIXTURE_API_PASSED'
    except Exception as error:
        report['reason'] = type(error).__name__ + ': ' + str(error)
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(report['state'], report.get('reason',''))
    return 0 if report['state'] == 'REAL_BROWSER_FIXTURE_API_PASSED' else 2
if __name__ == '__main__': sys.exit(main())
