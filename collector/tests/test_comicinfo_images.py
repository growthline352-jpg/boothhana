import json,tempfile,unittest,hashlib
from pathlib import Path
from unittest.mock import Mock,patch
from media_fetch import MediaError
from public_sources import PublicSources
from graph_worker import Worker,configuration

PAGE='https://comicw.net/g/3274'
def document(html,url=PAGE):
    def fetch(target,hosts,**kwargs):
        if target.endswith('/robots.txt'):raise MediaError('HTML HTTP 404')
        return '<title>공식 참가 인포</title><p>'+('공식 행사 참가 및 판매표 안내. '*10)+'</p>'+html,'a'*64
    return PublicSources([],fetch=fetch)([url])[0]

class ComicinfoImageTests(unittest.TestCase):
    def test_original_cover_and_all_article_images_are_available_for_product_reading(self):
        html='<img src="/data/info/cover/main_artist.png">'+''.join('<img src="https://comicw.net/data/info/editor/'+str(i)+'.jpg">' for i in range(5))
        html+='<img src="/data/info/editor/2.jpg"><img src="/g/img/default_thumb.png"><img src="/data/member/profile.jpg"><img src="https://foreign.example/data/info/editor/other.jpg">'
        row=document(html)
        self.assertEqual(6,len(row.get('images',[])))
        self.assertEqual(PAGE,row['images'][0]['pageUrl'])
        self.assertEqual('https://comicw.net/data/info/cover/main_artist.png',row['images'][0]['imageUrl'])
        self.assertTrue(all(i['pageUrl']==PAGE for i in row['images']))
        self.assertFalse(any('foreign.example' in i['imageUrl'] for i in row['images']))

    def test_unrelated_routes_and_non_raster_or_insecure_images_are_not_info_evidence(self):
        html='<img src="/data/info/cover/a.png"><img src="http://comicw.net/data/info/editor/b.jpg"><img src="/data/info/editor/logo.svg">'
        self.assertFalse(document(html,'https://comicw.net/g/search').get('images'))
        self.assertFalse(document(html,'https://foreign.example/g/3274').get('images'))
        self.assertEqual(1,len(document(html).get('images',[])))

    def test_every_official_image_is_attached_and_revisited_for_independent_review(self):
        row=document(''.join('<img src="/data/info/editor/'+str(i)+'.png">' for i in range(6)))
        seen=[]
        value={'assignments':[],'unresolved':[],'sources':[{'url':PAGE,'kind':'OFFICIAL','access':'ORIGINAL','evidence':'공식 인포 원문'}]}
        def search(cfg,directory,prompt,schema,images,**kwargs):
            seen.append((directory.parent.name,directory.name,cfg['model'],len(images)))
            if directory.name.startswith('images-'):
                offset=int(directory.name.split('-')[1]);result={'observations':[{'imageIndex':offset+i,'visibleText':'실제 옵션 '+str(offset+i),'uncertainties':[]} for i in range(len(images))]}
            else:result=value
            return json.dumps(result),False,{}
        loads=Mock(return_value=[row])
        with tempfile.TemporaryDirectory() as folder:
            cfg=configuration();cfg['stateDirectory']=folder;worker=Worker(cfg,Mock(),search,loads)
            with patch('graph_worker.fetch_image',side_effect=lambda url,*a,**k:(url.encode(),'image/png',hashlib.sha256(url.encode()).hexdigest())) as fetch:
                for phase in ('extract','review'):
                    worker.call(Path(folder)/phase,'공식 인포를 직접 판독',{'type':'object'},[],[PAGE],auto_sns_images=True,review=phase=='review')
            self.assertEqual(12,fetch.call_count);self.assertEqual(2,loads.call_count)
        for phase in ('extract','review'):
            self.assertEqual([4,2],[n for parent,name,model,n in seen if parent==phase and name.startswith('images-')])
            self.assertEqual([6],[n for parent,name,model,n in seen if name==phase])
        self.assertTrue(all(model=='gpt-6.1-sol' for _,_,model,_ in seen))

if __name__=='__main__':unittest.main()
