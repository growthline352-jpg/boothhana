from datetime import date
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from discovery_work import load_profiles, popup_jobs
from event_detail_sources import fetch_document

from catalog_rules import parse_schema
from daily_popups import collect_lotte_popups
from lotte_popup_sources import BOOTSTRAP, LIST_URL, DETAIL_BASE, OfficialSource, collect, parse_detail, parse_page

ID = 'SNM00000000000562455'
OTHER = 'SNM00000000000564588'
CARD = dict(id=ID, title='[아스토믹] Pop-Up Open!', location='백화점 잠실점 월드몰 B1 POP-UP')
SCOPE = dict(startDate='2026-10-06', endDate='2026-11-05')


def listing(ids=(ID,), page=1, more=False, total=None, location='백화점 잠실점 월드몰 B1 POP-UP', title='[아스토믹] Pop-Up Open!'):
    cards = ''.join(f'''<li class="content-item active"><a data-thumbnail onclick="lddi.DetailUrl.goUrl('C00903', '{id}')"><img src="unused"><div class="__state">행사 종료</div><div class="__title">{title}</div><div class="__info">{location}</div></a></li>''' for id in ids)
    return cards + f'''<script>$('[name="page"]').val("{page+1}");$('[name="hasNextYn"]').val("{'Y' if more else 'N'}");$('[name="totalCnt"]').val("{len(ids) if total is None else total}");</script>'''


def detail(id=ID, start='20261002000000', end='20261014000000', visible='10.2(금) ~ 10.14(수)', location='월드몰', image_id=None):
    return f'''<meta property="og:url" content="{DETAIL_BASE+id}"><meta property="og:image" content="https://minfo.lotteshopping.com/content/news/202610/{image_id or id}/poster.jpeg">
<h3 class="__detail-title"><span>[아스토믹]</span><br>Pop-Up Open!</h3><span class="__location">백화점 잠실점 </span><span class="__location"> {location}</span><span class="__place">[B1] POP-UP</span><p class="__date">{visible}</p><div class="__dim">행사 종료</div><p class="__txt-desc">캐릭터 굿즈 팝업스토어</p><script>lddi.ShareLink.appData.cntsStDtm = '{start}';lddi.ShareLink.appData.cntsEndDtm = '{end}';</script>'''


class LotteSourceTests(unittest.TestCase):
    def test_jamsil_has_a_branch_specific_source_in_seoul(self):
        profile = load_profiles(Path(__file__).resolve().parents[1]/'discovery_profiles.json')
        jobs = popup_jobs(profile, dict(region='SEOUL_GYEONGGI', timezone='Asia/Seoul', **SCOPE))
        jamsil = [r for r in jobs if '잠실' in r['subject']]
        self.assertEqual(len(jamsil), 1)
        self.assertEqual(jamsil[0]['payload']['region'], '서울')
        self.assertIn(BOOTSTRAP, jamsil[0]['payload']['seeds'])

    def test_robots_redirect_and_nonstandard_html_are_read_as_inert_rules(self):
        from robots_policy import allowed
        with patch('event_detail_sources.public_addresses', return_value=['8.8.8.8']), patch('event_detail_sources.PinnedHTTPS') as connection:
            first, last = Mock(), Mock()
            first.status = 307
            first.getheader.side_effect = lambda key, default=None: '/error01.html' if key=='Location' else default
            last.status = 200
            last.getheader.side_effect = lambda key, default=None: 'text/html' if key=='Content-Type' else default
            last.read.side_effect = [b'<html><p>not found</p></html>', b'']
            connection.return_value.getresponse.side_effect = [first, last]
            raw = fetch_document('https://minfo.lotteshopping.com/robots.txt', ['minfo.lotteshopping.com'], 10, robots=True)
            self.assertTrue(allowed(raw.decode(), 'BoothHana', 'https://minfo.lotteshopping.com/content/poster.jpeg'))
        # HTML wrappers must not hide real directives; scripts are never executed.
        with patch('event_detail_sources.public_addresses', return_value=['8.8.8.8']), patch('event_detail_sources.PinnedHTTPS') as connection:
            response = connection.return_value.getresponse.return_value
            response.status = 200
            response.getheader.side_effect = lambda key, default=None: 'text/html' if key=='Content-Type' else default
            response.read.side_effect = [b'<pre>User-agent: *\nDisallow: /content/</pre>', b'']
            raw = fetch_document('https://minfo.lotteshopping.com/robots.txt', ['minfo.lotteshopping.com'], 10, robots=True)
            self.assertFalse(allowed(raw.decode(), 'BoothHana', 'https://minfo.lotteshopping.com/content/poster.jpeg'))

    def test_robots_redirect_limits_hosts_and_server_errors_remain_denied(self):
        for status, target in [(302, 'https://127.0.0.1/robots.txt'), (302, 'https://other.example/robots.txt'), (503, None), (429, None), (302, '/robots.txt')]:
            with self.subTest(status=status, target=target), patch('event_detail_sources.public_addresses', return_value=['8.8.8.8']), patch('event_detail_sources.PinnedHTTPS') as connection:
                response = connection.return_value.getresponse.return_value
                response.status = status
                response.getheader.side_effect = lambda key, default=None: target if key=='Location' else default
                with self.assertRaises(ValueError):
                    fetch_document('https://minfo.lotteshopping.com/robots.txt', ['minfo.lotteshopping.com'], 10, robots=True)

    def test_exact_year_and_visible_range_override_hidden_ended_badge(self):
        event = parse_detail(detail(), CARD, date(2026, 10, 6), date(2026, 11, 5))
        self.assertEqual(event['occurrences'][0]['startDate'], '2026-10-02')
        self.assertEqual(event['operationStatus']['state'], 'SCHEDULED')
        self.assertEqual(event['banners'][0]['rights'], 'UNKNOWN')
        self.assertEqual(event['address'], '서울특별시 송파구 올림픽로 300')

    def test_cross_year_and_inclusive_end_day(self):
        event = parse_detail(detail(start='20261230000000', end='20270103000000', visible='12.30(수) ~ 1.3(일)'), CARD, date(2027, 1, 3), date(2027, 1, 31))
        self.assertEqual(event['occurrences'][0]['endDate'], '2027-01-03')
        self.assertIsNone(parse_detail(detail(), CARD, date(2026, 10, 15), date(2026, 11, 5)))

    def test_conflicting_or_missing_dates_and_wrong_branch_are_rejected(self):
        for html in (detail(visible='10.1(목) ~ 10.14(수)'), detail(start=''), detail(location='백화점'), detail(id=OTHER)):
            with self.subTest(html=html[:80]), self.assertRaises(ValueError):
                parse_detail(html, CARD, date(2026, 10, 6), date(2026, 11, 5))

    def test_only_event_bound_image_is_retained(self):
        event = parse_detail(detail(image_id=OTHER), CARD, date(2026, 10, 6), date(2026, 11, 5))
        self.assertEqual(event['banners'], [])

    def test_popup_without_keyword_in_title_is_discovered_from_official_body(self):
        card = {**CARD, 'title':'몽블랑 The Journey', 'location':'백화점 잠실점 백화점 월드몰 B1F 더크라운'}
        html = detail(location='백화점').replace('[B1] POP-UP', '월드몰 B1F 더크라운').replace('[아스토믹]</span><br>Pop-Up Open!', '몽블랑 The Journey').replace('캐릭터 굿즈 팝업스토어', '직접 만년필을 써보는 특별한 팝업')
        event = parse_detail(html, card, date(2026, 10, 6), date(2026, 11, 5))
        self.assertEqual(event['subcategory'], 'POPUP_EXPERIENCE')
        self.assertIn('ART_DESIGN', event['subjects'])
        event = parse_detail(detail().replace('minfo.lotteshopping.com', 'other.example'), CARD, date(2026, 10, 6), date(2026, 11, 5))
        self.assertEqual(event['banners'], [])

    def run_source(self, pages, details=None, **limits):
        with tempfile.TemporaryDirectory() as temp:
            def fetch(url, body):
                if url == BOOTSTRAP:
                    return '잠실점 C00903 /contents/shpgInfoList'
                if url == LIST_URL:
                    return pages[body['page']-1]
                return (details or {}).get(url, detail(id=url.split('=')[-1]))
            result = collect(SCOPE, Path(temp), fetch=fetch, **limits)
            parse_schema(json.dumps(result, ensure_ascii=False).encode(), 'event-result-v4.schema.json')
            trace = json.loads((Path(temp)/'source-trace.json').read_text())
            return result, trace

    def test_inventory_reads_all_pages_and_keeps_future_opening(self):
        result, trace = self.run_source([listing(page=1, more=True, total=2), listing(ids=(OTHER,), page=2, total=2)],
             {DETAIL_BASE+OTHER:detail(id=OTHER, start='20261007000000', end='20261103000000', visible='10.7(수) ~ 11.3(화)')})
        self.assertEqual(result['searchStatus'], 'COMPLETE')
        self.assertEqual(len(result['events']), 2)
        self.assertEqual(trace['observedCards'], 2)
        self.assertTrue(trace['paginationComplete'])

    def test_last_page_may_retain_its_current_cursor(self):
        html = listing().replace('.val("2")', '.val("1")')
        cards, more, total = parse_page(html, 1)
        self.assertEqual((len(cards), more, total), (1, False, 1))

    def test_repeated_truncated_and_bounded_inventory_are_partial(self):
        for pages, limits in (([listing(more=True, total=2), listing(page=2, total=2)], {}),
                              ([listing(total=3)], {}), ([listing(more=True, total=2)], dict(max_pages=1))):
            with self.subTest(pages=pages):
                result, trace = self.run_source(pages, **limits)
                self.assertEqual(result['searchStatus'], 'PARTIAL')
                self.assertTrue(trace['issues'])
                self.assertEqual(len(result['events']), 1)

    def test_other_branch_sales_and_permanent_store_are_excluded(self):
        for location, title in [('백화점 잠실점 백화점 5F', '브랜드 Pop-Up'), ('백화점 강남점 월드몰 B1', 'Pop-Up'), ('백화점 잠실점 월드몰 1F', 'New Open')]:
            result, _ = self.run_source([listing(location=location, title=title)])
            self.assertEqual(result['events'], [])

    def test_changed_markup_and_failed_detail_do_not_claim_complete(self):
        result, _ = self.run_source(['<html>잠시 후 다시 시도하세요</html>'])
        self.assertEqual(result['searchStatus'], 'PARTIAL')
        result, _ = self.run_source([listing()], {DETAIL_BASE+ID:'<html>missing date</html>'})
        self.assertEqual(result['searchStatus'], 'PARTIAL')

    def test_direct_pipeline_retains_manual_source_audit_and_requires_review(self):
        result, _ = self.run_source([listing()])
        with tempfile.TemporaryDirectory() as temp, patch('daily_popups.collect_lotte', return_value=result):
            run = Mock(scope=SCOPE, cfg=dict(blockedSourceHosts=[]))
            run.job_dir.return_value = Path(temp)
            self.assertEqual(collect_lotte_popups(run), 1)
            args, kw = run.deliver.call_args
            body = args[1]
            self.assertEqual(body['executionMode'], 'MANUAL_IMPORT')
            self.assertFalse(body['webSearchObserved'])
            self.assertTrue(body['result']['queries'])
            self.assertTrue(kw['legacy'])
            self.assertNotIn('reviewState', body['result']['events'][0])
            self.assertEqual(body['result']['events'][0]['banners'][0]['rights'], 'UNKNOWN')

    def test_network_requires_robots_and_rejects_redirects_and_truncation(self):
        with patch('lotte_popup_sources.allowed_by_robots', return_value=False):
            with self.assertRaisesRegex(ValueError, 'robots'):
                OfficialSource().get(LIST_URL, dict(page=1))
        for status, length, chunks in [(302, None, []), (200, '200', [b'partial', b''])]:
            with patch('lotte_popup_sources.allowed_by_robots', return_value=True), patch('lotte_popup_sources.public_addresses', return_value=['8.8.8.8']), patch('lotte_popup_sources.PinnedHTTPS') as connection:
                response = connection.return_value.getresponse.return_value
                response.status = status
                response.getheader.side_effect = lambda key, default=None: {'Content-Type':'text/html', 'Content-Length':length}.get(key, default)
                response.read.side_effect = chunks
                with self.assertRaises(ValueError):
                    OfficialSource().get(LIST_URL, dict(page=1))
                connection.return_value.close.assert_called_once()
