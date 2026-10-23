import json,tempfile,time,unittest
from datetime import datetime,timezone
from email.utils import format_datetime
from pathlib import Path
from unittest.mock import Mock,patch
import catalog_media_store as store
from media_fetch import fetch_image,MediaError

def throttled(header='120'):
    response=Mock();response.status=429;response.getheader.side_effect=lambda key,default=None:header if key=='Retry-After' else default
    connection=Mock();connection.getresponse.return_value=response
    with patch('media_fetch.public_addresses',return_value=['1.1.1.1']),patch('media_fetch.PinnedHTTPS',return_value=connection):
        try:fetch_image('https://images.example/a.png',['images.example'])
        except MediaError as error:return error
    raise AssertionError('Expected HTTP 429')

class ImageRateLimitTests(unittest.TestCase):
    def asset(self,id,host='images.example'):
        return {'id':id,'participantId':1,'revision':2,'rightsState':'APPROVED','storageState':'PENDING','imageUrl':f'https://{host}/{id}.png'}
    def api(self,assets):
        rows={a['id']:a for a in assets};api=Mock()
        def request(method,path,*args,**kwargs):
            if '?' in path:return assets
            id=int(path.split('/assets/')[1].split('/')[0])
            return {**rows[id],'storageState':'STORED'} if path.endswith('/content') else rows[id]
        api.request.side_effect=request;return api

    def test_429_preserves_only_a_bounded_retry_delay(self):
        self.assertEqual(120,getattr(throttled(),'retry_after',None))
        self.assertEqual(3600,getattr(throttled('untrusted arbitrary header'),'retry_after',None))
        self.assertNotIn('untrusted',str(throttled('untrusted arbitrary header')))
        with patch('media_fetch.time.time',return_value=1000):
            future=format_datetime(datetime.fromtimestamp(1090,timezone.utc),usegmt=True)
            self.assertEqual(90,getattr(throttled(future),'retry_after',None))

    def test_one_throttled_host_does_not_get_a_request_for_every_other_image(self):
        assets=[self.asset(1),self.asset(2),self.asset(3,'other.example')];api=self.api(assets)
        def fetch(url,*args,**kwargs):
            if 'images.example' in url:raise throttled()
            return b'image','image/png','a'*64
        with patch('catalog_media_store.fetch_image',side_effect=fetch) as download:
            result=store.store_approved(api)
        self.assertEqual(2,download.call_count)
        self.assertEqual([2],result['deferred']);self.assertEqual(3,result['stored'][0]['id'])

    def test_host_delay_survives_restart_and_expires_without_touching_rights(self):
        cls=getattr(store,'HostBackoff',None);self.assertIsNotNone(cls)
        with tempfile.TemporaryDirectory() as folder,patch('catalog_media_store.time.time',return_value=1000):
            path=Path(folder)/'hosts.json';state=cls(path);state.record('images.example',120)
            self.assertTrue(cls(path).blocked('images.example'))
            self.assertNotIn('Authorization',path.read_text())
            with patch('catalog_media_store.time.time',return_value=1121):self.assertFalse(cls(path).blocked('images.example'))

    def test_expired_host_delay_also_releases_the_original_image_for_retry(self):
        assets=[self.asset(1)];api=self.api(assets);retry_after={};state=store.HostBackoff()
        with patch('catalog_media_store.time.time',return_value=1000),patch('catalog_media_store.time.monotonic',return_value=1000),patch('catalog_media_store.fetch_image',side_effect=throttled()):
            store.store_approved(api,retry_after=retry_after,host_backoff=state)
        with patch('catalog_media_store.time.time',return_value=1121),patch('catalog_media_store.time.monotonic',return_value=1121),patch('catalog_media_store.fetch_image',return_value=(b'image','image/png','a'*64)):
            result=store.store_approved(api,retry_after=retry_after,host_backoff=state)
        self.assertEqual(1,len(result['stored']));self.assertFalse(result['deferred'])

    def test_sweep_advances_past_a_full_page_of_deferred_images(self):
        cls=getattr(store,'HostBackoff',None);self.assertIsNotNone(cls)
        state=cls();state.record('images.example',120)
        assets=[self.asset(i) for i in range(1,201)];api=self.api(assets)
        with patch('catalog_media_store.fetch_image') as download:
            result=store.store_approved(api,host_backoff=state,after_id=0)
        self.assertEqual(200,result['nextAfterId']);self.assertEqual(200,len(result['deferred']));download.assert_not_called()
        self.assertIn('afterId=0',api.request.call_args_list[0].args[1])
        next_assets=[self.asset(201,'other.example')];next_api=self.api(next_assets)
        with patch('catalog_media_store.fetch_image',return_value=(b'image','image/png','a'*64)):
            second=store.store_approved(next_api,host_backoff=state,after_id=result['nextAfterId'])
        self.assertEqual(0,second['nextAfterId']);self.assertEqual(201,second['stored'][0]['id'])

    def test_invalid_or_retreating_cursor_does_not_download_the_same_page_again(self):
        with patch('catalog_media_store.fetch_image') as download:
            with self.assertRaises(ValueError):store.store_approved(self.api([self.asset(1)]),after_id=-1)
            with self.assertRaises(ValueError):store.store_approved(self.api([self.asset(1)]),after_id=5)
        download.assert_not_called()

if __name__=='__main__':unittest.main()
