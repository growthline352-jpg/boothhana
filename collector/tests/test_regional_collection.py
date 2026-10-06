import copy
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from unittest.mock import patch

import weekly
from regional_discovery import regional_jobs, run_regional_jobs
from daily_popups import research_due
from event_queue import discovered_candidate_key

ROOT = Path(__file__).resolve().parents[1]
SCOPE = {'region':'SEOUL_GYEONGGI','timezone':'Asia/Seoul','startDate':'2026-11-01','endDate':'2026-12-31'}


class RegionalCollectionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        cfg=weekly.load_config(None);cfg.update(stateDirectory=self.temp.name,maxXRecentPages=0)
        self.run=weekly.Pipeline(cfg,Path(self.temp.name)/'run',SCOPE,dry_run=True)
        self.fixture=json.loads((ROOT/'examples/v5/events.json').read_text(encoding='utf-8'))
        for event in self.fixture['events']:
            event['occurrences']=[dict(startDate='2026-11-10',endDate='2026-11-11',startTime=None,endTime=None)]

    def run_result(self,job,result):
        with patch.object(self.run,'job',return_value=(result,True)),redirect_stdout(io.StringIO()):
            return self.run.discovery_work_item(job)

    def test_region_grid_covers_each_authority_in_each_category(self):
        jobs=regional_jobs(SCOPE);self.assertEqual(len(jobs),56)
        profile=json.loads((ROOT/'discovery_profiles.json').read_text(encoding='utf-8'))
        for category in ('SUBCULTURE','POPUP','FESTIVAL','EXHIBITION'):
            rows=[j for j in jobs if j['category']==category]
            seoul=[p for j in rows if j['payload']['region']=='서울' for p in j['payload']['places']]
            gyeonggi=[p for j in rows if j['payload']['region']=='경기' for p in j['payload']['places']]
            self.assertEqual(set(seoul),set(profile['festival']['seoulDistricts']))
            self.assertEqual(set(gyeonggi),set(profile['festival']['gyeonggiMunicipalities']))
            self.assertEqual(len(seoul),25);self.assertEqual(len(gyeonggi),31)
            for row in rows:
                for place in row['payload']['places']:
                    self.assertTrue(any(q.startswith(row['payload']['region']+' '+place+' ') for q in row['payload']['queryTemplates']))

    def test_popup_found_by_subculture_is_preserved_and_routed(self):
        item=self.run.discovery_work_queue.due('SUBCULTURE_RECENT',1)[0]
        event=self.fixture['events'][0];event['subcategory']='POPUP_RETAIL';event['subjects']=['CHARACTER_IP']
        self.assertEqual(self.run_result(item,self.fixture),1)
        candidate=next(iter(self.run.event_queue.candidates.values()))
        self.assertIn('POPUP_DAILY',candidate['origins'])
        self.assertEqual(candidate['discoveryLead']['subcategory'],'POPUP_RETAIL')
        self.assertEqual(item['routedCounts'],{'POPUP':1})

    def test_unknown_dates_remain_research_leads_not_ingested_events(self):
        item=self.run.discovery_work_queue.due('REGIONAL_SOURCE',1)[0]
        result=copy.deepcopy(self.fixture);result['events']=[]
        result['unverifiedLeads']=[dict(name='독립 공간 팝업',url='https://example.com/events/one',venueName=None,note='날짜 미확인')]
        self.assertEqual(self.run_result(item,result),1)
        candidate=next(iter(self.run.event_queue.candidates.values()))
        self.assertEqual(candidate['state'],'PENDING')
        self.assertEqual(candidate['discoveryLead']['occurrences'],[])
        self.assertEqual(item['state'],'PARTIAL')
        self.assertTrue(any('Unsearched regional areas' in x for x in item['issues']))

    def test_unknown_clues_with_different_sources_do_not_collapse(self):
        first=dict(name='브랜드 팝업',occurrences=[],sources=[{'url':'https://example.com/a'}])
        second={**first,'sources':[{'url':'https://example.com/b'}]}
        self.assertNotEqual(discovered_candidate_key(first,SCOPE),discovered_candidate_key(second,SCOPE))

    def test_invalid_unverified_url_is_rejected_without_losing_valid_clue(self):
        item=self.run.discovery_work_queue.due('REGIONAL_SOURCE',1)[0]
        result=copy.deepcopy(self.fixture);result['events']=[]
        result['unverifiedLeads']=[dict(name='unsafe',url='http://127.0.0.1/a',venueName=None,note='')]
        self.assertEqual(self.run_result(item,result),0)
        self.assertFalse(self.run.event_queue.candidates)
        self.assertIn('Invalid unverified lead URL',item['issues'])

    def test_partial_search_is_not_success_even_if_event_is_valid(self):
        item=self.run.discovery_work_queue.due('POPUP_SOURCE',1)[0]
        self.fixture['searchStatus']='PARTIAL'
        self.assertEqual(self.run_result(item,self.fixture),1)
        self.assertEqual(item['state'],'PARTIAL')
        self.assertIsNone(item.get('lastSuccessAt'))
        self.assertTrue(item['sourceCoverage'])

    def test_one_region_failure_does_not_abort_the_next_region(self):
        with patch.object(self.run,'discovery_work_item',side_effect=[RuntimeError('one'),0]),redirect_stdout(io.StringIO()),redirect_stderr(io.StringIO()):
            result=run_regional_jobs(self.run,2)
        self.assertEqual(result['attempted'],2);self.assertEqual(result['deferred'],0)

    def test_candidate_failure_does_not_abort_next_candidate(self):
        self.run.event_queue.enqueue(['first','second'],SCOPE)
        with patch.object(self.run,'research_event_name',side_effect=[RuntimeError('one'),None]),redirect_stdout(io.StringIO()),redirect_stderr(io.StringIO()):
            result=research_due(self.run,2,popup_only=False)
        self.assertEqual(result['attempted'],2)

    def test_budget_stop_retains_unattempted_jobs(self):
        with patch.object(self.run,'discovery_work_item',side_effect=weekly.CliBudgetExceeded('limit')),redirect_stdout(io.StringIO()),redirect_stderr(io.StringIO()):
            result=run_regional_jobs(self.run,2)
        self.assertEqual(result['attempted'],0);self.assertEqual(result['deferred'],2)
        self.assertTrue(self.run.issues)
        self.assertTrue(all(r['attempts']==0 for r in self.run.discovery_work_queue.due('REGIONAL_SOURCE',2)))

    def test_weekly_runner_reports_partial_source_coverage(self):
        self.run.cfg.update(maxFestivalDiscoveryJobs=1,maxSubcultureDiscoveryJobs=0,maxPopupDiscoveryJobs=0)
        def partial(item):
            self.run.discovery_work_queue.finish(item['key'],'PARTIAL',issues=['access failed'])
            return 0
        with patch.object(self.run,'discovery_work_item',side_effect=partial),redirect_stdout(io.StringIO()),redirect_stderr(io.StringIO()):
            self.run.discovery_work()
        self.assertTrue(any('Discovery scope remains incomplete' in issue for issue in self.run.issues))


if __name__=='__main__':unittest.main()
