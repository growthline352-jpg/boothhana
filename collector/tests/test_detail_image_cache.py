import hashlib,io,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from detail_image_cache import retain_images,approved_image,identity
from media_fetch import MediaError
import weekly
PAGE='https://sites.google.com/mihoyo.com/event/home'
URL='https://sites.google.com/sitesv-images-rt/expired=w1280'
CDN='https://lh7-rt.googleusercontent.com/rd-sitesv-images-rt/image'
HOSTS=['sites.google.com','lh7-rt.googleusercontent.com']

def packet(root):
 stream=io.BytesIO();Image.new('RGB',(3,2),(20,30,40)).save(stream,format='PNG');raw=stream.getvalue();digest=hashlib.sha256(raw).hexdigest()
 path=root/'poster.png';path.write_bytes(raw)
 rows=[dict(sourceUrl=PAGE,status='READ',images=[dict(url=URL,analysisStatus='ATTACHED',imageFile=path.name,contentType='image/png',sha256=digest,fetchedUrls=[URL,CDN])])]
 return rows,[path],raw,digest

class CachedImageTests(unittest.TestCase):
 def test_pending_analysis_can_read_bytes_but_cannot_use_approved_upload_path(self):
  import detail_image_cache
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);rows,files,raw,digest=packet(root);cache=root/'cache';retain_images(rows,files,cache)
   asset=dict(pageUrl=PAGE,imageUrl=URL,rightsState='PENDING')
   self.assertEqual(detail_image_cache.pending_image(asset,cache,HOSTS),(raw,'image/png',digest))
   self.assertIsNone(approved_image(asset,cache,HOSTS))
   asset['rightsState']='REJECTED';self.assertIsNone(detail_image_cache.pending_image(asset,cache,HOSTS))
 def test_approved_exact_image_uses_verified_bytes_after_source_expiry(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);rows,files,raw,digest=packet(root);cache=root/'cache';retain_images(rows,files,cache)
   asset=dict(pageUrl=PAGE,imageUrl=URL,rightsState='APPROVED')
   self.assertEqual(approved_image(asset,cache,HOSTS),(raw,'image/png',digest))
   for state in ('PENDING','REJECTED',None):
    asset['rightsState']=state;self.assertIsNone(approved_image(asset,cache,HOSTS))
   asset['rightsState']='APPROVED';asset['pageUrl']=PAGE+'/other';self.assertIsNone(approved_image(asset,cache,HOSTS))
 def test_admin_host_allowlist_and_current_block_policy_apply_to_redirects(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);rows,files,_,_=packet(root);cache=root/'cache';retain_images(rows,files,cache);asset=dict(pageUrl=PAGE,imageUrl=URL,rightsState='APPROVED')
   for hosts,blocked in [([],[]),(['sites.google.com'],[]),(HOSTS,['googleusercontent.com'])]:
    with self.assertRaises(MediaError):approved_image(asset,cache,hosts,blocked)
 def test_corrupt_or_escaped_objects_are_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);rows,files,raw,digest=packet(root);cache=root/'cache';retain_images(rows,files,cache);asset=dict(pageUrl=PAGE,imageUrl=URL,rightsState='APPROVED')
   (cache/(digest+'.image')).write_bytes(b'corrupted')
   with self.assertRaises(MediaError):approved_image(asset,cache,HOSTS)
   (cache/(digest+'.image')).write_bytes(raw)
   manifest=cache/(identity(PAGE,URL)+'.json');value=json.loads(manifest.read_text());value['sha256']='../../private';manifest.write_text(json.dumps(value))
   with self.assertRaises(MediaError):approved_image(asset,cache,HOSTS)
 def test_capture_requires_network_provenance_and_matching_checksum(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);rows,files,_,_=packet(root);cache=root/'cache';rows[0]['images'][0]['sha256']='0'*64
   with self.assertRaises(MediaError):retain_images(rows,files,cache)
   rows[0]['images'][0]['fetchedUrls']=[];retain_images(rows,files,cache);self.assertFalse(cache.exists())
 def test_image_stage_uploads_approved_cache_with_revision_and_digest(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);rows,files,raw,digest=packet(root);cfg=weekly.load_config(None);cfg.update(stateDirectory=str(root/'state'),imageAllowedHosts=HOSTS)
   retain_images(rows,files,root/'state/detail-image-cache-v1')
   runner=weekly.Pipeline(cfg,root/'run',dict(region='SEOUL',timezone='Asia/Seoul',startDate='2026-10-01',endDate='2026-10-31'),dry_run=True);runner.api=object()
   asset=dict(id=12,revision=7,pageUrl=PAGE,imageUrl=URL,rightsState='APPROVED');uploads=[]
   def request(method,path,data=None,**kwargs):
    if method=='GET':return [asset]
    if path.endswith('/content'):uploads.append(kwargs);return dict(storageState='STORED')
    return {}
   runner.request=request
   with patch.object(weekly,'fetch_image',side_effect=AssertionError('Expired URL refetched')):runner.images()
   self.assertEqual(len(uploads),1);self.assertEqual(uploads[0]['raw'],raw)
   self.assertEqual(uploads[0]['headers']['X-Asset-Revision'],'7');self.assertEqual(uploads[0]['headers']['X-Image-SHA256'],digest)
