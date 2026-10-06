"""Native guide observations cannot borrow another row's facts."""
from copy import deepcopy
import unittest

from run import RunError
import test_recheck_semantics


class GuideRowBindingTests(unittest.TestCase):
    def setUp(self):
        self.fixture=test_recheck_semantics.RecheckSemanticsTests()
        self.fixture.setUp()

    def ticket(self,name='일반 입장권',day=None,clock=None,price=None):
        row=self.fixture.ticket(name=name,day=day)
        row.update(entryTime=clock,priceAmount=price,currency='KRW' if price is not None else None)
        return row

    def confirm(self,text,guide):
        return self.fixture.confirm({'visitorGuide':guide},text)

    def reject(self,text,guide):
        with self.assertRaises(RunError):self.confirm(text,guide)

    def mixed(self):
        text=('일반 입장권 안내. 2026.11.10 일반 입장권 입장 시간 10:00. 가격 10,000원. '
              'VIP 입장권 안내. 2026.11.11 VIP 입장권 입장 시간 13:00. 가격 20,000원.')
        guide=self.fixture.guide(self.ticket(day='2026-11-10',clock='10:00',price='10000'),
            self.ticket('VIP 입장권','2026-11-11','13:00','20000'))
        return text,guide

    def test_native_ticket_controls_remain_confirmed(self):
        text,guide=self.mixed()
        self.assertEqual(self.confirm(text,guide)['values']['visitorGuide'],guide)

    def test_other_ticket_clock_is_not_evidence(self):
        text,guide=self.mixed()
        guide['tickets'][0]['entryTime']='13:00';guide['tickets'][1]['entryTime']='10:00'
        self.reject(text,guide)

    def test_other_ticket_price_is_not_evidence(self):
        text,guide=self.mixed()
        guide['tickets'][0]['priceAmount']='20000';guide['tickets'][1]['priceAmount']='10000'
        self.reject(text,guide)

    def test_other_ticket_visit_date_is_not_evidence(self):
        text,guide=self.mixed();guide['tickets'][0]['visitDate']='2026-11-11'
        self.reject(text,guide)

    def test_a_partial_payload_cannot_borrow_an_omitted_native_ticket(self):
        text,guide=self.mixed();guide['tickets']=guide['tickets'][:1]
        self.assertEqual(self.confirm(text,guide)['status'],'CONFIRMED')
        guide['tickets'][0]['priceAmount']='20000'
        self.reject(text,guide)

    def test_price_normalization_and_explicit_zero_are_valid(self):
        for source,amount in [('가격 8,000원','8000.00'),('가격 0원','0')]:
            with self.subTest(amount=amount):
                guide=self.fixture.guide(self.ticket(price=amount))
                self.assertEqual(self.confirm('일반 입장권 안내. '+source,guide)['status'],'CONFIRMED')

    def test_dates_and_identifiers_are_not_price_evidence(self):
        self.reject('일반 입장권 안내. 안내 번호 8000. 방문일 2026.11.10.',
                    self.fixture.guide(self.ticket(price='8000')))

    def sales_ticket(self):
        row=self.ticket()
        row.update(salesStartsAt='2026-10-01T09:00:00+09:00',salesEndsAt='2026-10-03T18:00:00+09:00')
        return self.fixture.guide(row)

    def test_sales_date_time_pairs_cannot_be_recombined(self):
        text='일반 입장권 예매 안내. 예매 시작 2026-10-01T09:00:00+09:00. 예매 종료 2026-10-03T18:00:00+09:00.'
        guide=self.sales_ticket()
        self.assertEqual(self.confirm(text,guide)['status'],'CONFIRMED')
        guide['tickets'][0].update(salesStartsAt='2026-10-01T18:00:00+09:00',salesEndsAt='2026-10-03T09:00:00+09:00')
        self.reject(text,guide)

    def test_native_sales_seconds_are_not_discarded(self):
        text='일반 입장권 예매 시작 2026-10-01T09:00:30+09:00.'
        row=self.ticket();row['salesStartsAt']='2026-10-01T09:00:00+09:00'
        self.reject(text,self.fixture.guide(row))
        row['salesStartsAt']='2026-10-01T00:00:30Z'
        self.assertEqual(self.confirm(text,self.fixture.guide(row))['status'],'CONFIRMED')

    def test_plain_sales_pairs_and_date_only_ranges_remain_valid(self):
        guide=self.sales_ticket()
        text='일반 입장권 예매 시작 2026.10.01 09:00. 예매 종료 2026.10.03 18:00.'
        self.assertEqual(self.confirm(text,guide)['status'],'CONFIRMED')
        guide['tickets'][0].update(salesStartsAt='2026-10-01',salesEndsAt='2026-10-03')
        self.assertEqual(self.confirm('일반 입장권 예매 기간 2026.10.01 ~ 2026.10.03.',guide)['status'],'CONFIRMED')

    def test_a_sales_end_cannot_be_used_as_a_sales_start(self):
        row=self.ticket();row['salesStartsAt']='2026-10-03T18:00:00+09:00'
        self.reject('일반 입장권 예매 종료 2026-10-03T18:00:00+09:00.',self.fixture.guide(row))

    def test_sales_clock_cannot_be_used_as_entry_clock(self):
        row=self.ticket(clock='09:00')
        self.reject('일반 입장권 예매 시작 2026-10-01T09:00:00+09:00.',self.fixture.guide(row))

    def test_entry_time_does_not_require_a_visit_date(self):
        self.assertEqual(self.confirm('일반 입장권 입장 시간 10:00.',
            self.fixture.guide(self.ticket(clock='10:00')))['status'],'CONFIRMED')

    def test_same_named_daily_rows_keep_prices_and_clocks_separate(self):
        first=self.ticket(day='2026-11-10',clock='10:00',price='8000')
        second=self.ticket(day='2026-11-11',clock='13:00',price='9000');second['id']='second'
        text=('일반 입장권 방문일 2026.11.10 입장 시간 10:00 가격 8,000원. '
              '일반 입장권 방문일 2026.11.11 입장 시간 13:00 가격 9,000원.')
        guide=self.fixture.guide(first,second)
        self.assertEqual(self.confirm(text,guide)['status'],'CONFIRMED')
        wrong=deepcopy(guide);wrong['tickets'][0]['priceAmount']='9000'
        self.reject(text,wrong)
        wrong=deepcopy(guide);wrong['tickets'][1]['entryTime']='10:00'
        self.reject(text,wrong)

    def test_program_and_faq_rows_use_their_own_sections(self):
        def program(name,clock):
            return dict(id='program-'+clock.replace(':',''),name=name,type='STAGE',subjects=[],day='2026-11-10',startTime=clock,
                        endTime=None,venue=None,ticketRequirement='UNKNOWN',ticketId=None,status='PUBLISHED',
                        note=None,sourceUrl=self.fixture.url,checkedOn='2026-10-07')
        guide=self.fixture.guide()
        guide['programs']=[program('개막 공연','10:00'),program('특별 공연','13:00')]
        text='개막 공연 2026.11.10 공연 시간 10:00. 특별 공연 2026.11.10 공연 시간 13:00.'
        self.assertEqual(self.confirm(text,guide)['status'],'CONFIRMED')
        guide['programs'][0]['startTime']='13:00';self.reject(text,guide)
        guide=self.fixture.guide()
        guide['faq']=[dict(id='a',question='재입장 가능한가요?',answer='재입장 가능합니다.',status='CONFIRMED',sourceUrl=self.fixture.url,checkedOn='2026-10-07'),
                      dict(id='b',question='음식 반입 가능한가요?',answer='음식 반입 불가입니다.',status='CONFIRMED',sourceUrl=self.fixture.url,checkedOn='2026-10-07')]
        text='재입장 가능한가요? 재입장 가능합니다. 음식 반입 가능한가요? 음식 반입 불가입니다.'
        self.assertEqual(self.confirm(text,guide)['status'],'CONFIRMED')
        guide['faq'][0]['answer']='음식 반입 불가입니다.';self.reject(text,guide)

    def program(self):
        return dict(id='p1',name='개막 공연',type='STAGE',subjects=[],day='2026-11-10',startTime='10:00',
            endTime=None,venue=None,ticketRequirement='UNKNOWN',ticketId=None,status='PUBLISHED',
            note=None,sourceUrl=self.fixture.url,checkedOn='2026-10-07')

    def test_native_date_and_clock_before_the_program_name_are_preserved(self):
        guide=self.fixture.guide();guide['programs']=[self.program()]
        self.assertEqual(self.confirm('2026.11.10 10:00 개막 공연 안내.',guide)['status'],'CONFIRMED')

    def test_partial_program_payload_cannot_borrow_an_omitted_program_clock(self):
        guide=self.fixture.guide();guide['programs']=[self.program()]
        text='개막 공연 2026.11.10 공연 시간 10:00. 특별 공연 2026.11.10 공연 시간 13:00.'
        self.assertEqual(self.confirm(text,guide)['status'],'CONFIRMED')
        guide['programs'][0]['startTime']='13:00';self.reject(text,guide)

    def test_coverage_status_is_bound_to_its_subject_and_publication_state(self):
        guide=self.fixture.guide()
        guide['coverage']=[dict(kind='PROGRAMS',status='PUBLISHED',note=None,sourceUrl=self.fixture.url,checkedOn='2026-10-07')]
        text='티켓 안내 공개. 프로그램은 미공개이며 추후 안내 예정입니다.'
        self.reject(text,guide)
        guide['coverage'][0]['status']='UNPUBLISHED'
        self.assertEqual(self.confirm(text,guide)['status'],'CONFIRMED')
        guide['coverage'][0]['status']='PUBLISHED'
        self.assertEqual(self.confirm('프로그램 안내 공개.',guide)['status'],'CONFIRMED')
        self.assertEqual(self.confirm('티켓 미공개, 프로그램 안내 공개.',guide)['status'],'CONFIRMED')

    def test_native_ticket_open_label_is_a_sales_start(self):
        row=self.ticket();row['salesStartsAt']='2026-10-01T09:00:00+09:00'
        self.assertEqual(self.confirm('일반 입장권 티켓 오픈 2026-10-01T09:00:00+09:00.',
                                     self.fixture.guide(row))['status'],'CONFIRMED')


if __name__=='__main__':unittest.main()
