import copy,json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from data_quality import attempt_record, select_targets
from image_repair import Repair, RepairQueue
from test_image_repair import FakeApi, target,asset
from weekly import Pipeline,load_config,DeliveryError


class CompletionRegressionTests(unittest.TestCase):
    def test_verified_unchanged_image_is_not_reopened_by_clock(self):
        with tempfile.TemporaryDirectory() as folder:
            queue = RepairQueue(Path(folder) / 'queue.json')
            value = target()
            at = datetime.now(timezone.utc)
            stamp, _ = queue.due(value, ['policy'], at)
            queue.record(value, stamp, 'VERIFIED', {}, at)
            self.assertFalse(queue.due(value, ['policy'], at + timedelta(days=30))[1])
            changed = copy.deepcopy(value)
            changed['event']['sources'].append(dict(kind='OFFICIAL', url='https://other.example/2026'))
            self.assertTrue(queue.due(changed, ['policy'], at)[1])

    def test_information_drain_processes_all_and_skips_after_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            cfg=load_config(None)
            cfg.update(stateDirectory=folder,drainEventEnrichments=True,autoApproveCollectedData=False)
            pipeline=Pipeline(cfg,Path(folder)/'run',dict(region='SEOUL',timezone='Asia/Seoul',startDate='2026-10-06',endDate='2026-12-05'),dry_run=True)
            pipeline.api=object()
            rows=[dict(id=i,revision=1,event=target(i)['event']) for i in range(1,206)]
            with patch.object(pipeline,'enrich_event',return_value=dict(status='SUCCESS')) as operation:
                pipeline.enrich_events(rows)
                self.assertEqual(operation.call_count,205)
            with patch.object(pipeline,'enrich_event') as operation:
                pipeline.enrich_events(rows)
                operation.assert_not_called()

    def test_different_image_methods_exhaust_once_and_new_source_reopens(self):
        with tempfile.TemporaryDirectory() as folder:
            value=target();cfg=dict(blockedSourceHosts=[],imageAllowedHosts=[],stateDirectory=folder)
            job=Repair(cfg,FakeApi([value]),Path(folder),drain=True)
            with patch.object(job,'discover_attempt',return_value=('NO_IMAGE_FOUND',{})) as method:
                job.run_batch()
                self.assertEqual([call.args[1] for call in method.call_args_list],['SOURCE_DETAILS','ORGANIZER_SEARCH','VENUE_SEARCH'])
            self.assertEqual(job.queue.rows['1']['state'],'EXHAUSTED')
            with patch.object(job,'discover_attempt') as method:
                self.assertEqual(job.run_batch()['processed'],0);method.assert_not_called()
            job.api.rows[0]['event']['sources'].append(dict(kind='VENUE',url='https://venue.example/new'))
            with patch.object(job,'discover_attempt',return_value=('VERIFIED',{})) as method:
                self.assertEqual(job.run_batch()['processed'],1);method.assert_called_once()

    def test_provider_block_never_exhausts_an_event(self):
        with tempfile.TemporaryDirectory() as folder:
            value=target();cfg=dict(blockedSourceHosts=[],imageAllowedHosts=[],stateDirectory=folder)
            job=Repair(cfg,FakeApi([value]),Path(folder),drain=True)
            with patch.object(job,'discover_attempt',side_effect=[('NO_IMAGE_FOUND',{}),('RESEARCH_BLOCKED',dict(research=dict(reason='USAGE_LIMIT')))]):
                job.run_batch()
            self.assertEqual(job.queue.rows['1']['state'],'RESEARCH_BLOCKED')
            self.assertNotIn('completedAt',job.queue.rows['1'])
    def test_storage_failure_is_not_exhausted_when_alternative_search_has_no_image(self):
        with tempfile.TemporaryDirectory() as folder:
            value=target();value['assets']=[asset(state='CANDIDATE')]
            cfg=dict(blockedSourceHosts=[],imageAllowedHosts=[],stateDirectory=folder)
            job=Repair(cfg,FakeApi([value]),Path(folder),drain=True)
            with patch.object(job,'store',side_effect=RuntimeError('storage API unavailable')),patch.object(job,'discover',return_value=('EXHAUSTED',{})):
                self.assertEqual(job.repair(value)[0],'STORAGE_FAILED')

    def test_completed_information_check_with_unpublished_gaps_is_not_repeated(self):
        value = target()['event']
        record = attempt_record(value, 'SUCCESS')
        self.assertEqual(select_targets([dict(id=1, event=value)], {'1': record}, 100, []), [])
    def test_api_delivery_failure_is_deferred_instead_of_exhausted(self):
        with tempfile.TemporaryDirectory() as folder:
            cfg=load_config(None);cfg.update(stateDirectory=folder,autoApproveCollectedData=False)
            pipeline=Pipeline(cfg,Path(folder)/'run',dict(region='SEOUL',timezone='Asia/Seoul',startDate='2026-10-06',endDate='2026-12-05'),dry_run=True)
            pipeline.api=object();rows=[dict(id=1,revision=1,event=target()['event'])]
            with patch.object(pipeline,'enrich_event',side_effect=DeliveryError('test delivery failure')) as operation:
                pipeline.enrich_events(rows);operation.assert_called_once()
            self.assertEqual(pipeline.enrichment_attempts['1']['resolution'],'DEFERRED')
            self.assertNotIn('completedAt',pipeline.enrichment_attempts['1'])
    def test_alternative_information_search_receives_prior_queries(self):
        with tempfile.TemporaryDirectory() as folder:
            cfg=load_config(None);cfg.update(stateDirectory=folder,autoApproveCollectedData=False)
            pipeline=Pipeline(cfg,Path(folder)/'run',dict(region='SEOUL',timezone='Asia/Seoul',startDate='2026-10-06',endDate='2026-12-05'),dry_run=True)
            pipeline.api=object();rows=[dict(id=1,revision=1,event=target()['event'])]
            def research(current,method,history):
                if method=='SOURCE_DETAILS':
                    (pipeline.job_dir('enrichment-1-1')/'validated-result.json').write_text(json.dumps(dict(queries=['original query'])),encoding='utf-8')
                    return dict(status='FAILED')
                self.assertEqual(method,'ORGANIZER_SEARCH');self.assertEqual(history[0]['queries'],['original query'])
                return dict(status='SUCCESS')
            with patch.object(pipeline,'enrich_event',side_effect=research) as operation:
                pipeline.enrich_events(rows);self.assertEqual(operation.call_count,2)
    def test_partial_information_never_sends_source_completion_marker(self):
        with tempfile.TemporaryDirectory() as folder:
            cfg=load_config(None);cfg.update(stateDirectory=folder,autoApproveCollectedData=False)
            pipeline=Pipeline(cfg,Path(folder)/'run',dict(region='SEOUL',timezone='Asia/Seoul',startDate='2026-10-06',endDate='2026-12-05'),dry_run=True)
            pipeline.api=object()
            rows=[dict(id=i,revision=1,event=target(i)['event'],repairSourceFailure=True) for i in (1,2)]
            with patch.object(pipeline,'enrich_event',return_value=dict(status='PARTIAL')) as operation,patch.object(pipeline,'request') as request:
                pipeline.enrich_events(rows)
                self.assertEqual(operation.call_count,6)
                request.assert_not_called()
            self.assertEqual(pipeline.enrichment_attempts['1']['resolution'],'DEFERRED')
            self.assertNotIn('completedAt',pipeline.enrichment_attempts['1'])
            self.assertEqual(pipeline.enrichment_attempts['2']['resolution'],'DEFERRED')

    def test_source_completion_is_reachable_only_after_every_method_succeeds(self):
        with tempfile.TemporaryDirectory() as folder:
            cfg=load_config(None);cfg.update(stateDirectory=folder,drainEventEnrichments=True,autoApproveCollectedData=True)
            pipeline=Pipeline(cfg,Path(folder)/'run',dict(region='SEOUL',timezone='Asia/Seoul',startDate='2026-10-06',endDate='2026-12-05'),dry_run=True)
            pipeline.api=object();rows=[dict(id=1,revision=1,event=target()['event'],repairSourceFailure=True)]
            refreshed_revision=1
            def request(method,path,data=None):
                nonlocal refreshed_revision
                if method=='GET':
                    refreshed_revision+=1
                    return dict(id=1,revision=refreshed_revision,event=target()['event'])
                self.assertEqual(path,'/events/1/source-exhausted')
                self.assertEqual(data,dict(eventRevision=4,methods=['SOURCE_DETAILS','ORGANIZER_SEARCH','VENUE_SEARCH'],methodStatuses=dict(SOURCE_DETAILS='SUCCESS',ORGANIZER_SEARCH='SUCCESS',VENUE_SEARCH='SUCCESS')))
                return dict(exhausted=True)
            with patch.object(pipeline,'enrich_event',return_value=dict(status='SUCCESS')) as operation,patch.object(pipeline,'request',side_effect=request) as marker:
                pipeline.enrich_events(rows)
                self.assertEqual(operation.call_count,3);self.assertEqual(marker.call_count,4)
            self.assertEqual(pipeline.enrichment_attempts['1']['resolution'],'EXHAUSTED')
            self.assertIn('completedAt',pipeline.enrichment_attempts['1'])
            with patch.object(pipeline,'enrich_event') as operation:
                pipeline.enrich_events(rows);operation.assert_not_called()

    def test_successful_last_method_does_not_hide_failed_prior_source_investigation(self):
        for initial in ('PARTIAL','FAILED'):
            with self.subTest(initial=initial),tempfile.TemporaryDirectory() as folder:
                cfg=load_config(None);cfg.update(stateDirectory=folder,drainEventEnrichments=True,autoApproveCollectedData=False)
                pipeline=Pipeline(cfg,Path(folder)/'run',dict(region='SEOUL',timezone='Asia/Seoul',startDate='2026-10-06',endDate='2026-12-05'),dry_run=True)
                pipeline.api=object();rows=[dict(id=1,revision=1,event=target()['event'],repairSourceFailure=True)]
                with patch.object(pipeline,'enrich_event',side_effect=[dict(status=initial),dict(status='SUCCESS'),dict(status='SUCCESS')]),patch.object(pipeline,'request') as marker:
                    pipeline.enrich_events(rows);marker.assert_not_called()
                self.assertEqual(pipeline.enrichment_attempts['1']['resolution'],'DEFERRED')
                self.assertNotIn('completedAt',pipeline.enrichment_attempts['1'])

    def test_source_marker_storage_failure_keeps_completed_investigation_retryable(self):
        with tempfile.TemporaryDirectory() as folder:
            cfg=load_config(None);cfg.update(stateDirectory=folder,drainEventEnrichments=True,autoApproveCollectedData=False)
            pipeline=Pipeline(cfg,Path(folder)/'run',dict(region='SEOUL',timezone='Asia/Seoul',startDate='2026-10-06',endDate='2026-12-05'),dry_run=True)
            pipeline.api=object();rows=[dict(id=1,revision=1,event=target()['event'],repairSourceFailure=True)]
            with patch.object(pipeline,'enrich_event',return_value=dict(status='SUCCESS')) as operation,patch.object(pipeline,'request',side_effect=RuntimeError('marker write failed')) as marker:
                pipeline.enrich_events(rows)
                self.assertEqual(operation.call_count,3);marker.assert_called_once()
            self.assertEqual(pipeline.enrichment_attempts['1']['resolution'],'DEFERRED')
            self.assertNotIn('completedAt',pipeline.enrichment_attempts['1'])
            self.assertEqual(len(select_targets(rows,pipeline.enrichment_attempts,100,[])),1)

    def test_drain_processes_more_than_100_and_restart_skips_completed(self):
        with tempfile.TemporaryDirectory() as folder:
            rows = [target(i) for i in range(1, 206)]
            cfg = dict(blockedSourceHosts=[], imageAllowedHosts=['official.example'],
                       stateDirectory=folder, downloadApprovedImages=True)
            job = Repair(cfg, FakeApi(rows), Path(folder), max_events=100, drain=True)
            with patch.object(job, 'repair', return_value=('VERIFIED', {})) as operation:
                report = job.run_batch()
                self.assertEqual(operation.call_count, 205)
            self.assertEqual(report['processed'], 205)
            self.assertEqual(report['dueDeferred'], 0)
            with patch.object(job, 'repair') as operation:
                self.assertEqual(job.run_batch()['processed'], 0)
                operation.assert_not_called()


if __name__ == '__main__':
    unittest.main()
