import copy,unittest
from graph_worker import creator_identity_anchors,require_creator_account_anchors
from run import RunError

OFFICIAL='https://dongne.co/events/example/circles/123'
PROFILE='https://www.postype.com/@artist'


class CreatorAccountEvidenceTests(unittest.TestCase):
    def test_only_existing_creator_and_original_participant_sources_are_anchors(self):
        context={'creator':{'data':{'profileUrl':PROFILE}},'creatorProvenance':[
            {'sources':[{'url':OFFICIAL,'access':'ORIGINAL'},{'url':'https://example.com/snippet','access':'SNIPPET'}],
             'officialLinks':['https://x.com/other_member'],'eventSources':[{'url':'https://example.com/event','access':'ORIGINAL'}]}],
             'publication':{'data':{'socialAccounts':[{'profileUrl':'https://x.com/artist'}]}}}
        before=copy.deepcopy(context)
        self.assertEqual([PROFILE,OFFICIAL],creator_identity_anchors(context))
        self.assertEqual(before,context)
        self.assertEqual([],creator_identity_anchors({'creatorProvenance':None}))
        self.assertEqual([],creator_identity_anchors({'creatorProvenance':[{'sources':None}]}))

    def test_every_account_needs_its_own_anchor_even_when_parent_or_sibling_cites_it(self):
        context={'creatorProvenance':[{'sources':[{'url':OFFICIAL,'access':'ORIGINAL'}]}]}
        first={'identityEvidence':[{'sourceUrl':OFFICIAL,'evidence':'Verified ownership chain'}]}
        second={'identityEvidence':[{'sourceUrl':PROFILE,'evidence':'Own profile'}]}
        result={'sources':[{'url':OFFICIAL,'access':'ORIGINAL'}],'socialAccounts':[first,second]}
        before=copy.deepcopy(result)
        with self.assertRaisesRegex(RunError,r'socialAccounts\[1\].identityEvidence'):
            require_creator_account_anchors(result,context)
        self.assertEqual(before,result)

    def test_source_normalization_preserves_identity_query_and_host(self):
        context={'creator':{'data':{'profileUrl':PROFILE+'?owner=1'}}}
        for url,allowed in ((PROFILE+'?owner=1',True),('https://WWW.POSTYPE.COM:443/@artist/?owner=1#section',True),
                            (PROFILE+'?owner=2',False),('https://postype.com/@artist?owner=1',False)):
            with self.subTest(url=url):
                result={'socialAccounts':[{'identityEvidence':[{'sourceUrl':url,'evidence':'Direct original'}]}]}
                if allowed:require_creator_account_anchors(result,context)
                else:
                    with self.assertRaises(RunError):require_creator_account_anchors(result,context)

    def test_missing_anchor_or_blank_evidence_cannot_approve_but_empty_accounts_preserve_old_accounts(self):
        require_creator_account_anchors({'socialAccounts':[]},{})
        for context,evidence in (({},'Checked'),({'creator':{'data':{'profileUrl':PROFILE}}},'  ')):
            with self.subTest(context=context),self.assertRaises(RunError):
                require_creator_account_anchors({'socialAccounts':[{'identityEvidence':[{'sourceUrl':PROFILE,'evidence':evidence}]}]},context)

    def test_explicit_empty_query_does_not_match_a_different_server_anchor(self):
        for anchor,source in ((PROFILE,PROFILE+'?'),(PROFILE+'?',PROFILE)):
            with self.subTest(anchor=anchor),self.assertRaises(RunError):
                require_creator_account_anchors({'socialAccounts':[{'identityEvidence':[{'sourceUrl':source,'evidence':'Direct original'}]}]},
                                               {'creator':{'data':{'profileUrl':anchor}}})


if __name__=='__main__':unittest.main()
