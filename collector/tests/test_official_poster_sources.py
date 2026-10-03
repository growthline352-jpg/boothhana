import sys,unittest,tempfile
import io,hashlib
from PIL import Image
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from official_poster_sources import parse_poster_document,poster_detail_url
from backfill_public_media import AdminApi,discover_generic_banners
from event_detail_sources import collect_detail_sources
PAGE='https://festival.seoul.go.kr/festival/main/festivalView.do?festacode=577'
HTML='''<meta property="og:image" content="/resources/img/common/img_meta_festa2.png"><nav><img src="/other.jpg"></nav><h1>행사 2026</h1><div class="poster-img"><img src="/poster.jpg" alt="2026 포스터"></div><img data-src="/lazy.jpg" src="data:image/gif;base64,X"><picture><source srcset="/responsive.jpg 1200w"></picture><div style="background-image:url('/background.jpg')"></div>'''
class PosterTests(unittest.TestCase):
 def test_body_poster_precedes_other_art_and_common_metadata_is_excluded(self):
  value=parse_poster_document(HTML,PAGE,'2026-10-03');images=value['images']
  self.assertEqual(images[0]['url'],'https://festival.seoul.go.kr/poster.jpg')
  self.assertEqual(images[0]['role'],'POSTER')
  self.assertEqual({x['url'].rsplit('/',1)[1] for x in images},{'poster.jpg','lazy.jpg','responsive.jpg','background.jpg'})
  self.assertNotIn('rights',images[0])
 def test_url_and_html_bounds(self):
  for url in ('http://festival.seoul.go.kr/a','https://festival.seoul.go.kr:444/a','https://festival.seoul.go.kr.evil.test/a','https://127.0.0.1/a','https://user:password@festival.seoul.go.kr/a'):self.assertIsNone(poster_detail_url(url))
  with self.assertRaises(ValueError):parse_poster_document('x'*(4*1024*1024+1),PAGE,'')
 def test_pagination_reaches_posters_after_event_100(self):
  api=AdminApi.__new__(AdminApi);calls=[]
  def request(method,path):
   calls.append(path);page=int(path.split('page=')[1].split('&')[0]);return dict(items=[dict(id=x) for x in range(page*100+1,min((page+1)*100+1,233))],total=232)
  api.request=request;self.assertEqual(len(api.events()),232);self.assertEqual(len(calls),3)
 def test_pagination_rejects_repeated_or_truncated_results(self):
  api=AdminApi.__new__(AdminApi);api.request=lambda *args:dict(items=[dict(id=1)],total=2)
  with self.assertRaises(RuntimeError):api.events()
  api.request=lambda *args:dict(items=[],total=2)
  with self.assertRaises(RuntimeError):api.events()
 def test_generic_discovery_uses_actual_seoul_poster_not_site_preview(self):
  api=AdminApi.__new__(AdminApi);api.event=lambda id:dict(event=dict(sources=[dict(url=PAGE)]),assets=[])
  with patch('backfill_public_media.source_html',return_value=HTML),patch('event_detail_sources.allowed_by_robots',return_value=True):rows,note=discover_generic_banners(api,[dict(id=1,name='행사')])
  self.assertEqual(len(rows),1);self.assertTrue(rows[0].image_url.endswith('/poster.jpg'))
 def test_rejected_stored_site_image_does_not_suppress_poster_rediscovery(self):
  api=AdminApi.__new__(AdminApi);api.event=lambda id:dict(event=dict(sources=[dict(url=PAGE)]),assets=[dict(type='BANNER',storageState='STORED',rightsState='REJECTED')])
  with patch('backfill_public_media.source_html',return_value=HTML),patch('event_detail_sources.allowed_by_robots',return_value=True):rows,_=discover_generic_banners(api,[dict(id=1,name='행사')])
  self.assertEqual(len(rows),1)
 def test_official_body_is_provided_to_analysis_and_blocked_hosts_never_fetched(self):
  event=dict(sources=[dict(kind='OFFICIAL',url=PAGE)])
  with tempfile.TemporaryDirectory() as tmp:
   rows,files=collect_detail_sources(event,Path(tmp),['festival.seoul.go.kr'],html_fetcher=lambda *args: self.fail('Blocked source fetched'),robots_checker=lambda *args:True)
   self.assertEqual(rows[0]['status'],'BLOCKED');self.assertEqual(files,[])
  with tempfile.TemporaryDirectory() as tmp:
   rows,files=collect_detail_sources(event,Path(tmp),[],html_fetcher=lambda *args:(HTML,'unused'),robots_checker=lambda *args:True,image_fetcher=lambda *args:(b'verified','image/jpeg','digest'))
   self.assertEqual(rows[0]['sourceType'],'OFFICIAL_POSTER_PAGE');self.assertEqual(rows[0]['status'],'READ');self.assertEqual(len(files),4)
 def test_aggregate_map_matches_only_target_even_late_in_page(self):
  html='<h1>2026 가을축제</h1>'+''.join(f'<img src="/p{x}.png" alt="다른 행사{x}">' for x in range(120))+'<img src="/target.jpg" alt="제3회 화성 루나 빛 축제">'
  doc=parse_poster_document(html,'https://web1.gg.go.kr/a','2026-10-03','제3회 화성 루나 빛 축제')
  self.assertEqual(len(doc['images']),1);self.assertTrue(doc['images'][0]['url'].endswith('/target.jpg'))
 def test_venue_source_and_known_placeholder_dont_become_poster_evidence(self):
  page='https://www.setec.or.kr/front/schedule/view.do?sIdx=1';html='<h1>제38회 플래툰 컨벤션</h1><img src="/default.jpg" alt="38회 플래툰 컨벤션">'
  from official_poster_sources import PLACEHOLDER_SHA256
  with tempfile.TemporaryDirectory() as tmp:
   rows,files=collect_detail_sources(dict(name='제38회 플래툰 컨벤션',sources=[dict(kind='VENUE',url=page)]),Path(tmp),[],html_fetcher=lambda *args:(html,'unused'),robots_checker=lambda *args:True,image_fetcher=lambda *args:(b'x','image/png',next(iter(PLACEHOLDER_SHA256))))
  self.assertEqual(rows[0]['images'][0]['analysisStatus'],'PLACEHOLDER');self.assertEqual(files,[])
 def test_missing_mime_uses_verified_bytes_but_declared_mismatch_html_and_limits_reject(self):
  from media_fetch import verified_content_type,MediaError
  out=io.BytesIO();Image.new('RGB',(2,2)).save(out,format='JPEG');raw=out.getvalue()
  for declared in ('','application/octet-stream'):
   self.assertEqual(verified_content_type(raw,declared),('image/jpeg',hashlib.sha256(raw).hexdigest()))
   for bad in (b'<html>no poster</html>',b'<svg/>',raw[:10]):
    with self.assertRaises(MediaError):verified_content_type(bad,declared)
   with self.assertRaises(MediaError):verified_content_type(raw,declared,max_pixels=1)
  for declared in ('image/png','text/html'):
   with self.assertRaises(MediaError):verified_content_type(raw,declared)

if __name__=='__main__':unittest.main()
