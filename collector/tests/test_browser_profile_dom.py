"""Real Chromium DOM regressions; synthetic pages, network disabled by routing.

Release validation enables BOOTH_BROWSER_DOM_TESTS=1 in the collector image.
The normal unit suite does not require a local browser installation.
"""
import os,unittest
from pathlib import Path
from browser_sources import DOM

@unittest.skipUnless(os.getenv('BOOTH_BROWSER_DOM_TESTS')=='1','explicit isolated Chromium DOM test')
class PublicProfileDomTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  from playwright.sync_api import sync_playwright
  cls.runtime=sync_playwright().start()
  cls.browser=cls.runtime.chromium.launch(headless=True,chromium_sandbox=True)
  cls.fixture=(Path(__file__).parent/'fixtures/x-public-profile-header.html').read_text(encoding='utf-8')
 @classmethod
 def tearDownClass(cls):
  cls.browser.close();cls.runtime.stop()
 def capture(self,html,path='/popopoooea'):
  context=self.browser.new_context(service_workers='block',accept_downloads=False)
  try:
   page=context.new_page()
   def route(r):
    if r.request.resource_type=='document':r.fulfill(status=200,content_type='text/html; charset=utf-8',body=html)
    else:r.abort()
   page.route('**/*',route)
   page.goto('https://x.com'+path,wait_until='domcontentloaded')
   return page.evaluate(DOM)
  finally:context.close()
 def test_current_public_header_includes_name_bio_and_actual_external_link(self):
  data=self.capture(self.fixture+'<form><input value="PRIVATE_LOGIN_VALUE"></form>')
  self.assertIn('프오',data['profile']);self.assertIn('@popopoooea',data['profile'])
  self.assertIn('오오에 장르계',data['profile']);self.assertNotIn('PRIVATE_LOGIN_VALUE',str(data))
  self.assertEqual([{'url':'https://t.co/C4a7WX3JsR','text':'postype.com/@popopoooea'}],data['profileLinks'])
 def test_wrong_actor_or_status_route_does_not_claim_profile_header(self):
  for path in ('/another','/popopoooea/status/123'):
   data=self.capture(self.fixture,path);self.assertEqual('',data['profile']);self.assertEqual([],data.get('profileLinks',[]))
 def test_quoted_and_hidden_headers_cannot_supply_profile_identity(self):
  data=self.capture('<article>'+self.fixture+'<div data-testid="UserDescription">인용한 다른 작가 소개</div></article><div style="display:none">'+self.fixture+'</div>')
  self.assertEqual('',data['profile']);self.assertEqual([],data.get('profileLinks',[]))
 def test_ambiguous_duplicate_visible_headers_are_not_combined(self):
  self.assertEqual('',self.capture(self.fixture+self.fixture)['profile'])
 def test_legacy_header_with_user_name_and_description_remains_supported(self):
  html='<div><a href="/popopoooea/photo">사진</a><div data-testid="UserName">프오<br>@popopoooea</div><div data-testid="UserDescription">공개 작가 소개</div></div>'
  data=self.capture(html);self.assertIn('프오',data['profile']);self.assertIn('공개 작가 소개',data['profile'])
 def test_header_inside_login_form_is_not_exported(self):
  self.assertEqual('',self.capture('<form>'+self.fixture+'</form>')['profile'])
