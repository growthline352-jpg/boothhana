import unittest
from repair_all import approve_existing
from run import RunError

class ApprovalBacklogTests(unittest.TestCase):
    def test_paginates_past_200_and_continues_after_one_failure(self):
        class Api:
            def __init__(self):self.visited=[];self.pages=[]
            def request(self,method,path,data=None):
                if method=='GET':
                    after=int(path.split('afterId=')[1]);self.pages.append(after)
                    return list(range(after+1,min(205,after+200)+1))
                event=int(path.split('/events/')[1].split('/')[0]);self.visited.append(event)
                if event==3:raise OSError('test only')
                return dict(published=True)
        api=Api();report=approve_existing(api,True)
        self.assertEqual(api.pages,[0,200]);self.assertEqual(api.visited,list(range(1,206)))
        self.assertEqual(report['approved'],204);self.assertEqual(report['failed'],[dict(eventId=3,error='OSError')])
    def test_repeated_cursor_is_rejected(self):
        class Api:
            def request(self,*args):return [1,1]
        with self.assertRaisesRegex(RunError,'Non-advancing'):approve_existing(Api(),True)
    def test_disabled_policy_makes_no_requests(self):
        class Api:
            def request(self,*args):raise AssertionError('policy disabled')
        self.assertEqual(approve_existing(Api(),False),dict(approved=0,failed=[]))
