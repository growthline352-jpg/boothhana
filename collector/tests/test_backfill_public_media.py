import pathlib,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from backfill_public_media import ComiverseParser,ProjectDollParser,WORK_CARD,normalized,fetch_promotional_image
from unittest.mock import patch
from PIL import Image
import hashlib,io
from media_fetch import MediaError

class PublicMediaBackfillTests(unittest.TestCase):
 def test_comiverse_attributes_keep_catalog_and_info_images(self):
  parser=ComiverseParser();parser.feed('''<div class="col booth-item" data-booth-name="테스트 부스" data-booth-display-no="A-1" data-catalog-image="/catalog/a.jpg" data-info-images="[&quot;/catalog/b.png&quot;,&quot;/catalog/b.png&quot;]"></div>''')
  self.assertEqual(parser.booths,[{'name':'테스트 부스','number':'A-1','catalog':'/catalog/a.jpg','info':['/catalog/b.png']}])
 def test_project_doll_links_image_to_stable_entry_id(self):
  parser=ProjectDollParser();parser.feed('''<li id="anchorBoxId_1158"><a href="/product/name/1158/category/81/display/1/"><img src="//projectdoll.net/web/product/medium/a.jpg" alt="참가자"></a></li>''')
  self.assertEqual(parser.items,[{'id':'1158','href':'/product/name/1158/category/81/display/1/','image':'//projectdoll.net/web/product/medium/a.jpg','name':'참가자'}])
 def test_dongne_card_links_cover_to_work_id(self):
  match=WORK_CARD.search('''<img src="/api/images/5720?size=small" alt="마중" loading="lazy"><div>...</div><a href="/works/w_COXaT8y5EA4T" class="stretched-link">마중</a>''')
  self.assertIsNotNone(match);self.assertEqual(match.group('id'),'w_COXaT8y5EA4T')
 def test_name_matching_ignores_spacing_and_width(self):
  self.assertEqual(normalized(' Ａ 부스 '),normalized('A부스'))
 def test_large_jpeg_gets_bounded_display_derivative(self):
  source=io.BytesIO();Image.new('RGB',(6000,5000),'white').save(source,format='JPEG')
  with patch('backfill_public_media.fetch_image',side_effect=[MediaError('Image format/pixel limit mismatch'),(source.getvalue(),'image/jpeg','unused')]):
   data,type_,digest=fetch_promotional_image('https://example.com/large.jpg','example.com')
  self.assertEqual(type_,'image/jpeg');self.assertEqual(digest,hashlib.sha256(data).hexdigest())
  with Image.open(io.BytesIO(data)) as result:self.assertLessEqual(result.width*result.height,25_000_000)

if __name__=='__main__':unittest.main()
