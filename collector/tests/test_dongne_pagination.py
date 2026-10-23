import unittest,json,tempfile
from pathlib import Path
from public_sources import PublicSources
from graph_worker import Worker,configuration,schema

URL='https://dongne.co/events/df2610/circles'

def listing(page=1,total=714,*,disabled=False,count=None,start=None):
    first=(page-1)*24+1 if start is None else start
    last=min(page*24,total)
    count=last-first+1 if count is None else count
    rows=''.join(f'<h3><a href="/events/df2610/circles/{1000+first+i}">Circle {first+i}</a></h3>' for i in range(count))
    return (f'<title>참가 서클 목록</title><main><h2>총 {total}개 서클</h2>'+rows+
            f'<div>전체 {total}개 중 {first}-{last}개 표시</div><span>{page} / {(total+23)//24}</span>'+
            '<button'+(' disabled' if disabled else '')+'><span>다음 페이지</span></button></main>')

def read(url=URL,body=None):
    def fetch(address,hosts,**kwargs):
        return ('User-agent: *\nAllow: /','policy') if address.endswith('/robots.txt') else (body or listing(),'raw-sha')
    return PublicSources([],fetch)([url])[0]

class DongnePaginationTests(unittest.TestCase):
    def test_button_only_pagination_exports_next_page_and_current_slice(self):
        doc=read();next_url=URL+'?page=2'
        self.assertTrue(doc['available']);self.assertTrue(doc['publicViewPartial'])
        self.assertEqual(next_url,doc['pagination']['nextPageUrl']);self.assertIn(next_url,doc['links'])
        self.assertEqual((1,30,714,1,24),(doc['pagination']['page'],doc['pagination']['totalPages'],doc['pagination']['reportedTotal'],doc['pagination']['rangeStart'],doc['pagination']['rangeEnd']))
        self.assertEqual(24,len(doc['pagination']['entryUrls']));self.assertEqual('raw-sha',doc['sha256'])

    def test_observed_page_query_advances_without_returning_to_first(self):
        doc=read(URL+'?page=2',listing(2))
        self.assertEqual(URL+'?page=3',doc['pagination']['nextPageUrl'])
        self.assertEqual(25,doc['pagination']['rangeStart'])

    def test_last_slice_is_partial_and_never_invents_page31(self):
        doc=read(URL+'?page=30',listing(30,disabled=True))
        self.assertTrue(doc['publicViewPartial']);self.assertIsNone(doc['pagination']['nextPageUrl'])
        self.assertEqual(18,len(doc['pagination']['entryUrls']))

    def test_filtered_mismatched_incomplete_or_ambiguous_pages_do_not_advance(self):
        for url,body in [(URL+'?page=2',listing()),(URL+'?page=2&search=test',listing(2)),
                         (URL+'?page=02',listing(2)),(URL,listing(count=23)),
                         (URL,listing(disabled=True)),(URL,listing()+'<button>다음 페이지</button>'),
                         (URL,listing()+'<div>전체 714개 중 1-24개 표시</div>')]:
            with self.subTest(url=url,body=body[-80:]):
                doc=read(url,body);self.assertTrue(doc['publicViewPartial']);self.assertNotIn('pagination',doc)

    def test_untrusted_scripts_and_other_domains_cannot_supply_pagination(self):
        for url,body in [(URL, '<p>'+('public '*30)+'</p><script>'+listing()+'</script>'),
                         (URL.replace('dongne.co','example.com'),listing()),
                         (URL+'/1001',listing())]:
            with self.subTest(url=url):self.assertNotIn('pagination',read(url,body))

    def test_extraction_and_review_refetch_page_and_recheck_controls(self):
        bodies=iter([listing(2),listing(2,disabled=True)])
        def fetch(url,hosts,**kwargs):return ('User-agent: *\nAllow: /','robots') if url.endswith('/robots.txt') else (next(bodies),'sha')
        reader=PublicSources([],fetch)
        self.assertIn('pagination',reader([URL+'?page=2'])[0]);self.assertNotIn('pagination',reader([URL+'?page=2'])[0])

    def test_worker_does_not_finish_whole_roster_after_a_slice_and_keeps_next(self):
        for page,disabled in ((2,False),(30,True)):
            doc=read(URL+'?page='+str(page),listing(page,disabled=disabled))
            next_url=doc['pagination']['nextPageUrl']
            result={'searchStatus':'COMPLETE','summary':'Current slice','queries':['official roster'],
                    'coverage':{'completeness':'COMPLETE','reportedTotal':714,'totalUnit':'REGISTERED_BOOTHS',
                                'visitedPages':[doc['url']],'nextPageUrl':next_url,'warnings':[]},
                    'participants':[],'sales':None,'pageBatch':None}
            with self.subTest(page=page),tempfile.TemporaryDirectory() as temp:
                cfg=configuration();cfg['stateDirectory']=temp
                worker=Worker(cfg,api=object(),search=lambda *a,**kw:(json.dumps(result),True,{}),source_loader=lambda urls:[doc])
                value,audit=worker.call(Path(temp)/'extract','test',schema('PARTICIPANTS'),[],[doc['url']])
            self.assertEqual('PARTIAL',value['searchStatus']);self.assertEqual('PARTIAL',value['coverage']['completeness'])
            self.assertEqual(next_url,value['coverage']['nextPageUrl']);self.assertEqual(doc['sha256'],audit['sourceDocuments'][0]['sha256'])
