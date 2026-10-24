import unittest
from graph_worker import require_creator_channel_scope
from run import RunError

PAGE='https://www.postype.com/@artist?page=2'
CONTEXT={'input':{'pageUrl':PAGE}}

class PostypeScopeGuardTests(unittest.TestCase):
 def test_missing_or_unverified_current_inventory_cannot_become_complete_or_continue(self):
  for documents in ([],[{'url':PAGE,'available':False}],[{'url':PAGE,'available':True,'channelPageVerified':False}]):
   for result in ({'coverage':'COMPLETE','nextPageUrl':None},{'coverage':'PARTIAL','nextPageUrl':'https://www.postype.com/@artist?page=3'}):
    with self.assertRaises(RunError):require_creator_channel_scope(result,CONTEXT,documents)
 def test_uncertain_profile_can_remain_partial_without_a_fabricated_cursor(self):
  require_creator_channel_scope({'coverage':'PARTIAL','nextPageUrl':None,'goods':[]},CONTEXT,[{'url':PAGE,'available':True,'channelPageVerified':False}])
 def test_auxiliary_channel_does_not_change_a_different_source_scope(self):
  for page in ('https://x.com/artist','https://www.postype.com/@artist/post/123',''):
   require_creator_channel_scope({'coverage':'COMPLETE'},{'input':{'pageUrl':page}},[{'url':PAGE,'available':True,'channelPageVerified':False}])
 def test_verified_next_page_is_preserved_but_wrong_cursor_and_early_completion_are_rejected(self):
  next_url='https://www.postype.com/@artist?page=3'
  documents=[{'url':PAGE,'available':True,'channelPageVerified':True,'pagination':{'nextPageUrl':next_url}}]
  require_creator_channel_scope({'coverage':'PARTIAL','nextPageUrl':next_url},CONTEXT,documents)
  for result in ({'coverage':'PARTIAL','nextPageUrl':'https://www.postype.com/@artist?page=4'},{'coverage':'COMPLETE','nextPageUrl':None}):
   with self.assertRaises(RunError):require_creator_channel_scope(result,CONTEXT,documents)
