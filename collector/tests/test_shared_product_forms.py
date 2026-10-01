import copy,io,json,sys,tempfile,unittest
from contextlib import redirect_stdout
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import weekly

class SharedProductFormsTests(unittest.TestCase):
 def result(self):
  result=json.loads((weekly.ROOT/'examples/v5/sales.json').read_text(encoding='utf8'))
  p=result['sales']['products'][0]
  p.update(sourceEntryId=None,identity=None,productUrl='https://example.com/form/1')
  p['sources'][0]['url']=p['productUrl']
  q=copy.deepcopy(p);q['name']='Different option'
  result['sales']['products']=[p,q]
  return result
 def normalize(self,result):return weekly.Pipeline.normalize_sales_result(weekly.Pipeline.__new__(weekly.Pipeline),result,{})
 def test_shared_form_options_keep_separate_observation_keys(self):
  result=self.result();result['coverage'].update(completeness='COMPLETE',reportedTotal=2,totalUnit='PRODUCTS')
  result,keys,_=self.normalize(result)
  self.assertEqual(len(keys),2)
  self.assertEqual(result['coverage']['completeness'],'COMPLETE')
  for p in result['sales']['products']:
   self.assertIsNone(p['productUrl']);self.assertEqual(p['sources'][0]['url'],'https://example.com/form/1')
 def test_shared_identity_detail_is_also_removed(self):
  result=self.result()
  for p in result['sales']['products']:p['identity']={'sourceSystem':'https://example.com','entryId':None,'detailUrl':p['productUrl']}
  result,keys,_=self.normalize(result)
  self.assertEqual(len(keys),2)
  self.assertTrue(all(p['identity'] is None for p in result['sales']['products']))
 def test_distinct_real_ids_are_preserved(self):
  result=self.result()
  for i,p in enumerate(result['sales']['products']):p.update(sourceEntryId=str(i),identity={'sourceSystem':'https://example.com','entryId':str(i),'detailUrl':p['productUrl']})
  result,keys,_=self.normalize(result)
  self.assertEqual(len(keys),2);self.assertTrue(all(p['productUrl'] for p in result['sales']['products']))
 def test_mixed_known_and_unknown_identity_is_not_guessed(self):
  result=self.result();result['sales']['products'][0]['sourceEntryId']='real-id'
  with self.assertRaises(weekly.RunError):self.normalize(result)
 def test_unique_detail_url_is_unchanged(self):
  result=self.result();result['sales']['products'][1]['productUrl']='https://example.com/product/2'
  normalized,keys,_=self.normalize(result)
  self.assertEqual(len(keys),2);self.assertTrue(all(p['productUrl'] for p in normalized['sales']['products']))
 def test_normalizing_twice_is_idempotent(self):
  result,keys,_=self.normalize(self.result());again,keys2,_=self.normalize(copy.deepcopy(result))
  self.assertEqual(result,again);self.assertEqual(keys,keys2)
 def test_shared_form_without_source_is_held(self):
  result=self.result()
  for p in result['sales']['products']:p['sources'][0]['url']='https://example.com/unrelated'
  with self.assertRaises(weekly.RunError):self.normalize(result)
 def test_tracking_and_fragments_do_not_disguise_shared_form(self):
  result=self.result();result['sales']['products'][1]['productUrl']='https://example.com/form/1?utm_source=test#option2'
  result,keys,_=self.normalize(result)
  self.assertEqual(len(keys),2);self.assertTrue(all(p['productUrl'] is None for p in result['sales']['products']))
 def test_unknown_prices_and_sales_scope_are_preserved(self):
  result=self.result()
  for p in result['sales']['products']:p.update(price=None,evidenceScope='GENERAL_CATALOG',saleState='UNKNOWN')
  result,_,_=self.normalize(result)
  for p in result['sales']['products']:
   self.assertIsNone(p['price']);self.assertEqual(p['evidenceScope'],'GENERAL_CATALOG');self.assertEqual(p['saleState'],'UNKNOWN')
 def test_progress_is_flushed_and_persisted_without_credentials(self):
  with tempfile.TemporaryDirectory() as folder:
   pipeline=weekly.Pipeline.__new__(weekly.Pipeline)
   pipeline.folder=Path(folder);pipeline.id='test-run';pipeline.calls=3;pipeline.receipts={'one':{}};pipeline.cfg={'token':'must-not-leak'}
   stream=io.StringIO()
   with redirect_stdout(stream):pipeline.progress('sales-1','SAVED')
   saved=json.loads((Path(folder)/'progress.json').read_text())
   self.assertEqual(saved['phase'],'SAVED');self.assertEqual(saved['savedReceipts'],1)
   self.assertEqual(json.loads(stream.getvalue())['collectorProgress'],saved)
   self.assertNotIn('must-not-leak',stream.getvalue())

if __name__=='__main__':unittest.main()
