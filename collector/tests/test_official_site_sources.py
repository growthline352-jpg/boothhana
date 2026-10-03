from pathlib import Path
import sys,tempfile,unittest,json
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from official_site_sources import site_detail_url,parse_site_document,SITE_IMAGE_HOSTS
from event_detail_sources import collect_detail_sources,detail_coverage_issues
from data_quality import select_targets,attempt_record
import weekly

PAGE='https://sites.google.com/mihoyo.com/hoyoland2026/hoyoland2026'
IMAGE='https://sites.google.com/sitesv-images-rt/signed=w1280'
HTML=f'<meta property="og:image" content="{IMAGE}"><script>SECRET instruction</script><h1>호요랜드2026</h1><p>입장 예약 안내</p><img src="{IMAGE}"><a href="{PAGE}/notice">통합 주의사항</a><a href="https://sites.google.com/evil.example/site/notice">다른 사이트</a><img src="http://127.0.0.1/private"><img src="https://untrusted.example/image.jpg">'

class OfficialSiteTests(unittest.TestCase):
 def test_extract_actual_image_without_scripts_or_cross_tenant_crawl(self):
  row=parse_site_document(HTML,PAGE,'2026-10-03')
  self.assertNotIn('SECRET',row['bodyText']);self.assertIn('호요랜드2026',row['bodyText'])
  self.assertEqual([i['url'] for i in row['images']],[IMAGE]);self.assertEqual(row['images'][0]['role'],'PAGE_PREVIEW')
  self.assertEqual(row['childUrls'],[PAGE+'/notice'])
 def test_canonical_paths_reject_login_and_host_path_tricks(self):
  self.assertEqual(site_detail_url(PAGE+'/#part'),PAGE)
  self.assertIsNotNone(site_detail_url('https://sites.google.com/view/event2026/home'))
  for url in ['http://sites.google.com/view/event/home','https://sites.google.com.evil.example/view/event/home','https://u@sites.google.com/view/event/home','https://sites.google.com/feeds','https://sites.google.com/view/site/../private','https://sites.google.com/view/site/%2fprivate','https://sites.google.com/view/site?q=secret']:
   self.assertIsNone(site_detail_url(url))
 def test_bounded_same_site_second_pass_and_exact_cdn_redirect_hosts(self):
  event=dict(sources=[dict(url=PAGE,kind='OFFICIAL')],discoveryLinks=[])
  fetched=[];image_hosts=[]
  def html(url,hosts,timeout):
   fetched.append(url)
   return (HTML if url==PAGE else '<p>QR 캡처 불가. 취소 규정.</p>','digest')
  def image(url,hosts,timeout):
   image_hosts.extend(hosts);return b'fake-verified-by-injected-fetcher','image/jpeg','digest'
  with tempfile.TemporaryDirectory() as tmp:
   directory=Path(tmp)
   observations,images=collect_detail_sources(event,directory,[],html_fetcher=html,image_fetcher=image,robots_checker=lambda *args:True)
   self.assertEqual(fetched,[PAGE,PAGE+'/notice']);self.assertEqual(len(images),1)
   self.assertIn('lh7-rt.googleusercontent.com',image_hosts);self.assertNotIn('*.googleusercontent.com',image_hosts)
   self.assertEqual(observations[0]['images'][0]['analysisStatus'],'ATTACHED')
   self.assertEqual(observations[0]['unreadChildUrls'],[])
   issues=detail_coverage_issues(event,observations);self.assertIn('MISSING_DETAIL_BANNER',issues);self.assertIn('MISSING_DETAIL_VISIT_FAQ',issues)
   self.assertEqual(collect_detail_sources(event,directory,[],html_fetcher=lambda *a:self.fail('Checkpoint refetched')), (observations,images))
   with self.assertRaisesRegex(ValueError,'policy changed'):collect_detail_sources(event,directory,['sites.google.com'])
 def test_blocked_official_or_cdn_is_never_fetched(self):
  event=dict(sources=[dict(url=PAGE,kind='OFFICIAL')],discoveryLinks=[])
  with tempfile.TemporaryDirectory() as tmp:
   obs,images=collect_detail_sources(event,Path(tmp),['sites.google.com'],html_fetcher=lambda *a:self.fail('blocked fetched'),robots_checker=lambda *a:True)
   self.assertEqual(obs[0]['status'],'BLOCKED');self.assertEqual(images,[])
  with tempfile.TemporaryDirectory() as tmp:
   obs,images=collect_detail_sources(event,Path(tmp),['googleusercontent.com'],html_fetcher=lambda *a:('<p>入場</p><img src="https://lh7-rt.googleusercontent.com/image">','x'),image_fetcher=lambda *a:self.fail('blocked image fetched'),robots_checker=lambda *a:True)
   self.assertEqual(images,[]);self.assertEqual(obs[0]['images'][0]['analysisStatus'],'BLOCKED')
 def test_sites_discovery_link_alone_does_not_establish_official_source(self):
  event=dict(sources=[],discoveryLinks=[dict(kind='PARTICIPANTS',url=PAGE)])
  with tempfile.TemporaryDirectory() as tmp:self.assertEqual(collect_detail_sources(event,Path(tmp),[],html_fetcher=lambda *a:self.fail('untrusted tenant')),([],[]))
 def test_unread_pages_and_inaccessible_images_stay_partial(self):
  event=dict(sources=[dict(url=PAGE,kind='OFFICIAL')],discoveryLinks=[])
  links=''.join(f'<a href="{PAGE}/notice-{i}">notice</a>' for i in range(8))
  with tempfile.TemporaryDirectory() as tmp:
   obs,images=collect_detail_sources(event,Path(tmp),[],html_fetcher=lambda *a:(HTML+links,'x'),image_fetcher=lambda *a:(_ for _ in ()).throw(ValueError('403')),robots_checker=lambda *a:True)
   self.assertEqual(len(obs),3);self.assertEqual(images,[])
   self.assertIn('DETAIL_CHILD_PAGES_NOT_FULLY_READ',detail_coverage_issues(event,obs));self.assertIn('DETAIL_IMAGE_INACCESSIBLE',detail_coverage_issues(event,obs))
 def test_first_official_detail_pass_is_queued_even_without_general_gaps(self):
  target=dict(id=11,event=dict(sources=[dict(kind='OFFICIAL',url=PAGE)]))
  with patch('data_quality.missing_reasons',return_value=[]):
   self.assertEqual(select_targets([target],{},1,[]),[target])
   self.assertEqual(select_targets([target],{'11':attempt_record(target['event'],'SUCCESS',[PAGE])},1,[]),[])

class BacklogTests(unittest.TestCase):
 def test_317_events_across_boundary_are_inspected_and_fairly_selected(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);cfg=weekly.load_config(None);cfg['stateDirectory']=str(root/'state')
   scope=dict(region='SEOUL',timezone='Asia/Seoul',startDate='2026-10-01',endDate='2026-12-31')
   pipeline=weekly.Pipeline(cfg,root/'run',scope,dry_run=True)
   def request(method,path):
    after=int(path.rsplit('=',1)[1]);return [dict(id=i,revision=1,event=dict(name='행사'+str(i))) for i in range(after+1,min(after+201,318))]
   pipeline.request=request
   rows=pipeline.enrichment_backlog();self.assertEqual(len(rows),317);self.assertEqual(rows[-1]['id'],317)
   attempts={str(i):dict(checkedAt='2026-10-02') for i in range(1,201)}
   self.assertEqual(select_targets(rows,attempts,1,[])[0]['id'],201)
   self.assertEqual(pipeline.stats['enrichmentInspected'],317)
 def test_broken_server_cursor_fails_without_looping(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);cfg=weekly.load_config(None);cfg['stateDirectory']=str(root/'state')
   pipeline=weekly.Pipeline(cfg,root/'run',dict(region='SEOUL',timezone='Asia/Seoul',startDate='2026-10-01',endDate='2026-12-31'),dry_run=True)
   pipeline.request=lambda *a:[dict(id=1,event={}),dict(id=1,event={})]
   with self.assertRaisesRegex(weekly.RunError,'cursor'):pipeline.enrichment_backlog()
