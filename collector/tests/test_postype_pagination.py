import unittest
from postype_sources import postype_pagination

BASE='https://www.postype.com/@artist'
def page(n,total=28):
 count=min(12,total-(n-1)*12);pages=(total+11)//12
 posts=''.join('<a href="/@artist/post/'+str(i)+'">작가 공개 게시글</a>' for i in range((n-1)*12+1,(n-1)*12+count+1))
 controls='<button aria-label="이전 페이지"'+(' disabled' if n==1 else '')+'></button>'
 controls+=''.join('<button class="'+('pt-IconButton-variantSoft' if i==n else 'pt-IconButton-variantPlain')+'">'+str(i)+'</button>' for i in range(1,pages+1))
 controls+='<button aria-label="다음 페이지"'+(' disabled' if n==pages else '')+'></button>'
 return '<div id="activity-content">총 '+str(total)+'개'+posts+'<div data-sentry-component="Pagination">'+controls+'</div></div>'

class PostypePaginationTests(unittest.TestCase):
 def test_observed_twelve_post_pages_keep_exact_entries_and_last_page_termination(self):
  all_posts=set()
  for n in (1,2,3):
   d=postype_pagination(BASE+('?page='+str(n) if n>1 else ''),page(n))
   self.assertTrue(d['publicViewPartial']);p=d['pagination']
   self.assertEqual(n,p['page']);self.assertEqual(3,p['totalPages']);self.assertEqual(28,p['reportedTotal'])
   self.assertEqual(BASE+'?page='+str(n+1) if n<3 else None,p['nextPageUrl'])
   self.assertFalse(all_posts&set(p['entryUrls']));all_posts.update(p['entryUrls'])
  self.assertEqual(28,len(all_posts))
  self.assertEqual(28,postype_pagination(BASE,page(1).replace('총 28개','총 <span>28</span> 개'))['pagination']['reportedTotal'])
 def test_changed_counts_controls_selection_and_duplicate_regions_do_not_invent_next_page(self):
  html=page(1)
  bad=[html.replace('총 28개','총 37개'),html.replace('총 28개','총 12개'),html.replace('pt-IconButton-variantSoft','pt-IconButton-variantPlain'),
   html.replace('aria-label="다음 페이지"','disabled aria-label="다음 페이지"'),html+html,html.replace('/@artist/post/1"','/@other/post/1"')]
  for candidate in bad:
   self.assertNotIn('pagination',postype_pagination(BASE,candidate))
 def test_scripts_hidden_regions_and_sidebar_links_cannot_supply_inventory_or_cursor(self):
  for html in ('<script>'+page(1)+'</script>','<div hidden>'+page(1)+'</div>',page(1).replace('id="activity-content"','id="sidebar"')):
   self.assertNotIn('pagination',postype_pagination(BASE,html))
  self.assertEqual(12,len(postype_pagination(BASE,page(1)+'<aside><a href="/@artist/post/999">다른 링크</a></aside>')['pagination']['entryUrls']))
 def test_only_observed_channel_query_protocol_is_followed(self):
  self.assertEqual(BASE+'?activity-type=post&page=2',postype_pagination(BASE+'?activity-type=post',page(1))['pagination']['nextPageUrl'])
  for suffix in ('?page=0','?page=1&page=2','?private=true','?activity-type=request','#other','/post/1'):
   self.assertNotIn('pagination',postype_pagination(BASE+suffix,page(1)))
 def test_script_loaded_empty_channel_shell_is_not_a_verified_empty_inventory(self):
  d=postype_pagination(BASE+'?page=2','<div id="activity-content"></div>')
  self.assertFalse(d['channelPageVerified']);self.assertIn('channelPageWarning',d);self.assertNotIn('pagination',d)
 def test_explicit_single_page_count_can_validate_without_navigation_controls(self):
  for html,total in [('<div id="activity-content">총 0개</div>',0),('<div id="activity-content">총 1개<a href="/@artist/post/1">공개 게시글</a></div>',1)]:
   d=postype_pagination(BASE,html);self.assertTrue(d['channelPageVerified']);self.assertEqual(total,d['pagination']['reportedTotal'])
   self.assertIsNone(d['pagination']['nextPageUrl'])
