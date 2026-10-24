import unittest
from public_sources import PublicSources,postype_canonical_transport
from media_fetch import MediaError

APEX='https://postype.com/@artist'
CANONICAL='https://www.postype.com/@artist'
BODY='<title>작가 채널</title><p>'+('공개 작가와 판매 안내 '*15)+'</p><a href="/@artist/post/123">판매 안내</a>'

class PostypeCanonicalTests(unittest.TestCase):
 def fetcher(self,*,apex_denied=False,canonical_denied=False):
  calls=[]
  def fetch(url,hosts,**kwargs):
   calls.append((url,hosts))
   if url=='https://postype.com/robots.txt':
    # The real apex robots request redirects to the same provider's www host.
    if 'www.postype.com' not in hosts:raise MediaError('Image host is not in administrator allowlist')
    return 'User-agent: *\n'+('Disallow: /' if apex_denied else 'Allow: /'),'apex-robots'
   if url=='https://www.postype.com/robots.txt':
    return 'User-agent: *\n'+('Disallow: /' if canonical_denied else 'Allow: /'),'www-robots'
   if url.startswith('https://www.postype.com/'):
    self.assertEqual(['www.postype.com'],hosts)
    return BODY,'canonical-http-body'
   raise MediaError('Unexpected noncanonical request')
  return fetch,calls
 def test_observed_canonical_transport_preserves_requested_evidence_and_relative_links(self):
  fetch,calls=self.fetcher();doc=PublicSources([],fetch)([APEX])[0]
  self.assertTrue(doc['available'],doc)
  self.assertEqual(APEX,doc['url']);self.assertEqual(CANONICAL,doc['transportUrl'])
  self.assertEqual('canonical-http-body',doc['sha256'])
  self.assertIn('https://www.postype.com/@artist/post/123',doc['links'])
  self.assertEqual(['https://postype.com/robots.txt','https://www.postype.com/robots.txt',CANONICAL],[url for url,_ in calls])
 def test_either_host_block_stops_the_alias_before_any_network_request(self):
  for blocked in ('postype.com','www.postype.com'):
   fetch,calls=self.fetcher();doc=PublicSources([blocked],fetch)([APEX])[0]
   self.assertFalse(doc['available']);self.assertEqual([],calls)
 def test_both_original_and_canonical_robot_policies_can_deny_the_body(self):
  for options in ({'apex_denied':True},{'canonical_denied':True}):
   fetch,calls=self.fetcher(**options);doc=PublicSources([],fetch)([APEX])[0]
   self.assertFalse(doc['available']);self.assertIn('robots disallows',doc['failure'])
   self.assertFalse(any('/robots.txt' not in url for url,_ in calls))
 def test_each_phase_rechecks_policies_and_keeps_actual_query_and_public_route(self):
  fetch,calls=self.fetcher();reader=PublicSources([],fetch)
  for _ in range(2):
   doc=reader([APEX+'?page=2'])[0]
   self.assertTrue(doc['available']);self.assertEqual(CANONICAL+'?page=2',doc['transportUrl'])
  self.assertEqual(2,[u for u,_ in calls].count(CANONICAL+'?page=2'))
  self.assertEqual(2,[u for u,_ in calls].count('https://postype.com/robots.txt'))
  self.assertEqual(2,[u for u,_ in calls].count('https://www.postype.com/robots.txt'))
 def test_existing_www_sources_are_not_rewritten_or_given_extra_hosts(self):
  fetch,calls=self.fetcher();doc=PublicSources([],fetch)([CANONICAL])[0]
  self.assertTrue(doc['available']);self.assertNotIn('transportUrl',doc)
  self.assertTrue(all(hosts==['www.postype.com'] for _,hosts in calls))
 def test_unrecognized_routes_and_other_providers_do_not_get_the_alias_exception(self):
  for url in ('https://postype.com/login','https://postype.com/settings','https://artist.postype.com/@artist','https://postype.com.evil.test/@artist','https://another.example/@artist'):
   calls=[]
   def fetch(address,hosts,**kwargs):
    calls.append((address,hosts));raise MediaError('test stop')
   PublicSources([],fetch)([url])
   self.assertTrue(calls);self.assertNotIn('www.postype.com',calls[0][1])
 def test_public_channel_owner_post_and_series_routes_keep_their_exact_path(self):
  for path in ('/@artist/post/123','/post/123','/profile/@owner','/@artist/series','/@artist/series/456','/@artist/community'):
   url='https://postype.com'+path;fetch,_=self.fetcher();doc=PublicSources([],fetch)([url])[0]
   self.assertTrue(doc['available'],doc);self.assertEqual(url,doc['url'])
   self.assertEqual('https://www.postype.com'+path,doc['transportUrl'])
 def test_canonical_transport_does_not_normalize_credentials_ports_or_fragments(self):
  for url in ('http://postype.com/@artist','https://user:password@postype.com/@artist','https://@postype.com/@artist','https://postype.com:444/@artist',APEX+'#private','https://postype.com/login','https://postype.com/api/account'):
   self.assertIsNone(postype_canonical_transport(url))
