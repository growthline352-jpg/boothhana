from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from schedule_inventory import ScheduleInventory, links_from, scoped_url, read_fact_documents, Page, listing_dates
from regional_discovery import SCHEDULES

SPEC=dict(url='https://example.com/list',detailPattern=r'/event/\d+',listPattern=r'/list\?page=\d+')
SCOPE=dict(startDate='2026-10-06',endDate='2026-12-05')


class ScheduleInventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.path=Path(self.temp.name)/'state.json';self.calls=[]
        self.pages={SPEC['url']:'<a href="/event/1">one</a><a href="/list?page=2">next</a>',
                    'https://example.com/list?page=2':'<a href="/event/2">two</a><a href="/list?page=3">next</a>',
                    'https://example.com/list?page=3':'<a href="/event/3">three</a>'}
        for i in range(1,4):self.pages['https://example.com/event/'+str(i)]='<h1>event '+str(i)+'</h1>actual venue text'

    def fetch(self,url):self.calls.append(url);return self.pages[url]

    def scan(self):return ScheduleInventory(self.path,fetch=self.fetch).scan(SPEC,SCOPE)

    def test_all_pages_and_all_details_are_read(self):
        row=self.scan()
        self.assertEqual(row['state'],'COMPLETE');self.assertEqual(len(row['pages']),3)
        self.assertEqual(len(row['documents']),3);self.assertEqual(len(self.calls),6)

    def test_failed_detail_does_not_discard_other_links_and_is_retried(self):
        saved=self.pages.pop('https://example.com/event/2');row=self.scan()
        self.assertEqual(row['state'],'PARTIAL');self.assertEqual(len(row['documents']),2)
        self.pages['https://example.com/event/2']=saved
        self.assertEqual(self.scan()['state'],'COMPLETE')

    def test_time_budget_retains_unvisited_pages_and_continues(self):
        def fetch(url):
            html=self.fetch(url);inventory.deadline=0;return html
        inventory=ScheduleInventory(self.path,fetch=fetch)
        row=inventory.scan(SPEC,SCOPE)
        self.assertEqual(row['state'],'PARTIAL');self.assertEqual(row['pagesPending'],['https://example.com/list?page=2'])
        self.assertEqual(self.scan()['state'],'COMPLETE')

    def test_changed_first_page_restarts_snapshot_and_retains_history(self):
        self.scan();self.pages[SPEC['url']]='<a href="/event/9">new</a>'
        self.pages['https://example.com/event/9']='<h1>new</h1>venue'
        row=self.scan();self.assertEqual(set(row['entries']),{'https://example.com/event/9'})
        self.assertEqual(len(row['previousSnapshot']),3)

    def test_changing_nonce_does_not_restart_an_unchanged_inventory(self):
        self.pages[SPEC['url']]+='<script>nonce="first"</script>';self.scan()
        self.calls=[];self.pages[SPEC['url']]=self.pages[SPEC['url']].replace('first','second')
        row=self.scan()
        self.assertEqual(row['state'],'COMPLETE');self.assertEqual(self.calls,[SPEC['url']])

    def test_daily_completed_snapshot_refreshes_detail_changes(self):
        self.scan()
        inventory=ScheduleInventory(self.path,fetch=self.fetch)
        source=next(iter(inventory.value['sources'].values()));source['completedAt']='2020-01-01T00:00:00+00:00';inventory.save()
        self.pages['https://example.com/event/1']='<h1>new detail</h1>changed address'
        self.assertIn('changed address',self.scan()['documents']['https://example.com/event/1']['bodyText'])

    def test_unimplemented_js_pagination_is_not_reported_complete_on_restart(self):
        self.pages[SPEC['url']]='<a href="/event/1">one</a><a href="javascript:goPage(2)">next</a>'
        row=self.scan();self.assertEqual(row['state'],'PARTIAL')
        self.assertTrue(any('UNRESOLVED_JS_PAGINATION' in x for x in row['issues']))
        self.assertEqual(self.scan()['state'],'PARTIAL')

    def test_cross_host_or_private_links_never_traversed(self):
        self.pages[SPEC['url']]+='<a href="https://other.example/event/4">no</a><a href="http://127.0.0.1/event/4">no</a>'
        self.assertEqual(len(self.scan()['entries']),3)

    def test_empty_landing_with_list_link_continues_to_full_inventory(self):
        self.pages[SPEC['url']]='<a href="/list?page=2">all events</a>'
        self.assertEqual(len(self.scan()['documents']),2)

    def test_coex_scope_is_applied_to_every_page_and_details_deduplicated(self):
        spec=SCHEDULES['EXHIBITION'][0]
        url=scoped_url(spec['url'],spec,SCOPE)
        self.assertIn('search_end_date=2026.12.05',url)
        html='<a href="/event/full-schedules/?var_page=3&search_end_date=2026.11.06">3</a><a href="/exhibitions/one/?var_page=3">event</a>'
        pages,details,_,_=links_from(html,url,spec,SCOPE)
        self.assertIn('var_page=3',pages[0]);self.assertIn('search_end_date=2026.12.05',pages[0])
        self.assertEqual(list(details),['https://www.coex.co.kr/exhibitions/one/'])

    def test_blocked_tmm_source_does_not_open_native_api(self):
        with patch('event_detail_sources.fetch_document') as read:
            result=read_fact_documents(['https://takemm.com/prod/view/71267'],{},['takemm.com'])
        read.assert_not_called();self.assertEqual(result['https://takemm.com/prod/view/71267']['status'],'INACCESSIBLE')

    def test_event_heading_excludes_global_logo_and_jsonld_copies_only_venue_facts(self):
        html='<h1>site logo</h1><h2 class="SingleTitle">Actual event</h2><script type="application/ld+json">'
        html+='{"@type":"PerformingArtsTheater","name":"hall","address":{"streetAddress":"서울 마포구 월드컵로 41-1"},"telephone":"private","email":"private"}</script>'
        page=Page(html)
        self.assertEqual(page.detail_heading,['Actual event']);self.assertIn('서울 마포구 월드컵로 41-1',page.text)
        self.assertNotIn('private',page.text)

    def test_list_dates_are_actual_event_periods_not_current_window(self):
        self.assertEqual(listing_dates('행사 2026.01.01 - 2026.01.02 장소')[0]['endDate'],'2026-01-02')
        self.assertEqual(listing_dates('날짜 미확인'),[])


if __name__ == '__main__':unittest.main()
