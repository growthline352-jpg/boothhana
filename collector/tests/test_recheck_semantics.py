"""Native observations preserve their subject, date/time relationship and final dates."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout
import io

from catalog_rules import parse_schema
from official_poster_sources import parse_official_document
from run import RunError
import recheck
import weekly


class RecheckSemanticsTests(unittest.TestCase):
    def setUp(self):
        self.url='https://example.com/event/2026'
        self.event=dict(name='2026 테스트 행사',organizer='주최',edition='2026',
            occurrences=[dict(startDate='2026-11-10',endDate='2026-11-11',startTime=None,endTime=None)],
            sources=[dict(kind='OFFICIAL',access='ORIGINAL',url=self.url)])
        self.target=dict(id=1,revision=2,event=self.event)

    def prepare(self,fields,text):
        detail=parse_official_document('<h1>'+self.event['name']+'</h1><p>'+text+'</p>',self.url,'2026-10-06',self.event['name'])
        result=dict(searchStatus='COMPLETE',identity={k:self.event[k] for k in ('name','organizer','edition')},
                    fields={key:dict(state='CONFIRMED',value=value,sourceUrl=self.url,evidence=text) for key,value in fields.items()})
        parse_schema(json.dumps(result,ensure_ascii=False).encode(),'event-recheck.schema.json')
        return result,[dict(url=self.url,text=detail['bodyText'])]

    def confirm(self,fields,text):
        result,docs=self.prepare(fields,text)
        return recheck.observation(self.target,result,docs)

    def status(self,state):return dict(state=state,note=None,sourceUrl=self.url,checkedOn='2026-10-06')

    def ticket(self,name='일반 입장권',day=None,booking='UNKNOWN'):
        return dict(id='general' if name=='일반 입장권' else 'vip',name=name,visitDate=day,
            priceAmount=None,currency=None,salesStartsAt=None,salesEndsAt=None,entryTime=None,
            reservationUrl=None,status='PUBLISHED',bookingState=booking,note=None,
            sourceUrl=self.url,checkedOn='2026-10-06')

    def guide(self,*tickets):return dict(tickets=list(tickets),programs=[],faq=[],sales=[],coverage=[])

    def test_reservation_cancellation_is_not_event_cancellation(self):
        text='예약 취소는 행사일 전일까지 가능합니다. 행사는 예정대로 정상 진행합니다.'
        with self.assertRaises(RunError):self.confirm({'operationStatus':self.status('CANCELED')},text)
        self.assertEqual(self.confirm({'operationStatus':self.status('SCHEDULED')},text)['status'],'CONFIRMED')

    def test_ticket_and_program_cancellation_do_not_cancel_the_event(self):
        for text in ['행사 안내: 입장권 예약 취소 정책입니다. 행사는 정상 진행합니다.',
                     '무대 프로그램은 취소되었습니다. 전체 행사는 예정대로 진행합니다.']:
            with self.subTest(text=text),self.assertRaises(RunError):
                self.confirm({'operationStatus':self.status('CANCELED')},text)
            self.assertEqual(self.confirm({'operationStatus':self.status('SCHEDULED')},text)['status'],'CONFIRMED')

    def test_actual_event_cancellation_postponement_and_reschedule_are_supported(self):
        for state,text in [('CANCELED','주최 사정으로 이번 행사를 취소합니다.'),
                           ('POSTPONED','이번 행사 개최가 연기되었습니다.'),
                           ('RESCHEDULED','행사 일정이 변경되었습니다.')]:
            with self.subTest(state=state):
                self.assertEqual(self.confirm({'operationStatus':self.status(state)},text)['values']['operationStatus']['state'],state)

    def test_named_event_cancellation_without_generic_subject_is_supported(self):
        self.assertEqual(self.confirm({'operationStatus':self.status('CANCELED')},
            '2026 테스트 행사가 취소되었습니다.')['status'],'CONFIRMED')

    def test_negation_or_conditional_event_cancellation_is_not_confirmed(self):
        for text in ['행사는 취소하지 않습니다.','행사는 취소될 가능성이 있습니다.',
                     '행사가 취소되면 예매 금액을 환불합니다.','행사 취소 시 환불합니다.',
                     '행사 취소시에는 환불합니다.','행사 취소 여부를 문의합니다.','This event is not canceled.']:
            with self.subTest(text=text),self.assertRaises(RunError):
                self.confirm({'operationStatus':self.status('CANCELED')},text)

    def test_actual_english_event_status_is_supported(self):
        self.assertEqual(self.confirm({'operationStatus':self.status('POSTPONED')},
            'This event has been postponed.')['status'],'CONFIRMED')

    def test_cropped_negation_cannot_confirm_cancellation(self):
        result,docs=self.prepare({'operationStatus':self.status('CANCELED')},'행사는 취소하지 않습니다.')
        result['fields']['operationStatus']['evidence']='행사는 취소'
        with self.assertRaises(RunError):recheck.observation(self.target,result,docs)

    def test_dates_alone_cannot_reverse_a_native_event_cancellation(self):
        quote='행사 개최일 2026.11.10 ~ 2026.11.11'
        result,docs=self.prepare({'operationStatus':self.status('SCHEDULED')},quote+'. 주최 사정으로 이번 행사를 취소합니다.')
        result['fields']['operationStatus']['evidence']=quote
        with self.assertRaises(RunError):recheck.observation(self.target,result,docs)
        self.assertEqual(self.confirm({'operationStatus':self.status('SCHEDULED')},quote)['status'],'CONFIRMED')

    def test_booking_suspended_is_closed_and_cannot_be_open(self):
        text='일반 입장권 예매 중단 안내. 시스템 점검으로 예매 중단되었습니다.'
        with self.assertRaises(RunError):
            self.confirm({'visitorGuide':self.guide(self.ticket(booking='OPEN'))},text)
        got=self.confirm({'visitorGuide':self.guide(self.ticket(booking='CLOSED'))},text)
        self.assertEqual(got['values']['visitorGuide']['tickets'][0]['bookingState'],'CLOSED')
        self.assertEqual(got['values']['visitorGuide']['tickets'][0]['status'],'PUBLISHED')

    def test_open_booking_positive_and_negative_context(self):
        for text in ['일반 입장권 예매 중입니다.','일반 입장권 예약 가능합니다.']:
            with self.subTest(text=text):
                self.assertEqual(self.confirm({'visitorGuide':self.guide(self.ticket(booking='OPEN'))},text)['status'],'CONFIRMED')
        for text in ['일반 입장권 예약 가능하지 않습니다.','일반 입장권 예매 중이 아닙니다.']:
            with self.subTest(text=text),self.assertRaises(RunError):
                self.confirm({'visitorGuide':self.guide(self.ticket(booking='OPEN'))},text)

    def test_mixed_ticket_states_are_bound_to_each_named_ticket(self):
        text='일반 입장권 예매 마감 안내. VIP 입장권 예매 중입니다.'
        guide=self.guide(self.ticket(booking='CLOSED'),self.ticket(name='VIP 입장권',booking='OPEN'))
        self.assertEqual(self.confirm({'visitorGuide':guide},text)['status'],'CONFIRMED')
        bad=copy.deepcopy(guide);bad['tickets'][0]['bookingState']='OPEN'
        with self.assertRaises(RunError):self.confirm({'visitorGuide':bad},text)

    def test_same_name_daily_tickets_keep_their_own_booking_state(self):
        text='일반 입장권 2026.11.10 예매 마감 안내. 일반 입장권 2026.11.11 예매 중입니다.'
        first=self.ticket(day='2026-11-10',booking='CLOSED')
        second=self.ticket(day='2026-11-11',booking='OPEN');second['id']='general-next-day'
        guide=self.guide(first,second)
        self.assertEqual(self.confirm({'visitorGuide':guide},text)['status'],'CONFIRMED')
        bad=copy.deepcopy(guide);bad['tickets'][0]['bookingState']='OPEN'
        with self.assertRaises(RunError):self.confirm({'visitorGuide':bad},text)
        bad=copy.deepcopy(guide);bad['tickets'][1]['bookingState']='CLOSED'
        with self.assertRaises(RunError):self.confirm({'visitorGuide':bad},text)

    def test_cropped_booking_suspension_cannot_confirm_open(self):
        result,docs=self.prepare({'visitorGuide':self.guide(self.ticket(booking='OPEN'))},'일반 입장권 예매 중단되었습니다.')
        result['fields']['visitorGuide']['evidence']='일반 입장권 예매 중'
        with self.assertRaises(RunError):recheck.observation(self.target,result,docs)

    def changed(self):
        text='행사 일정이 변경되었습니다. 행사 개최일: 2026.12.10 ~ 2026.12.11. 일반 입장권 안내. 일반 입장권 방문일 2026.12.10.'
        dates=[dict(startDate='2026-12-10',endDate='2026-12-11',startTime=None,endTime=None)]
        return text,dates,self.guide(self.ticket(day='2026-12-10'))

    def test_simultaneous_dates_and_guide_use_the_new_confirmed_context_in_both_orders(self):
        text,dates,guide=self.changed()
        before=copy.deepcopy(self.event)
        for fields in [dict(occurrences=dates,visitorGuide=guide),dict(visitorGuide=guide,occurrences=dates)]:
            with self.subTest(order=list(fields)):
                got=self.confirm(fields,text)
                self.assertEqual(got['status'],'CONFIRMED');self.assertEqual(got['values'],fields)
        self.assertEqual(self.event,before)

    def test_unproved_new_dates_cannot_justify_guide_or_change_the_target(self):
        text,dates,guide=self.changed();before=copy.deepcopy(self.event)
        bad=copy.deepcopy(dates);bad[0]['startDate']='2026-12-09'
        with self.assertRaises(RunError):self.confirm(dict(visitorGuide=guide,occurrences=bad),text)
        self.assertEqual(self.event,before)
        result,docs=self.prepare(dict(occurrences=dates,visitorGuide=guide),text)
        result['fields']['occurrences']['state']='SOURCE_UNPUBLISHED'
        with self.assertRaises(RunError):recheck.observation(self.target,result,docs)

    def test_actual_main_submits_both_new_fields_instead_of_extraction_failure(self):
        text,dates,guide=self.changed();result,docs=self.prepare(dict(visitorGuide=guide,occurrences=dates),text)
        captured=[]
        class FakeApi:
            def request(api,method,path,body=None):
                if method=='GET' and path.endswith('recheck-workload'):return {'due':1}
                if method=='GET' and '/recheck-events?' in path:return [self.target]
                if method=='POST' and path.endswith('/observations'):
                    captured.append(body);return {'changedFields':list(body['values'])}
                raise AssertionError((method,path))
        with tempfile.TemporaryDirectory() as folder:
            cfg=recheck.load_config(None);cfg.update(stateDirectory=folder)
            with patch.object(recheck,'load_config',return_value=cfg),patch.object(recheck,'Api',return_value=FakeApi()), \
                 patch.object(weekly,'Api',return_value=FakeApi()),patch.object(recheck,'read_sources',return_value=(docs,{},[])), \
                 patch.object(recheck,'extract_documents',return_value=result),redirect_stdout(io.StringIO()):
                self.assertEqual(recheck.main(['--limit','1']),0)
        self.assertEqual(captured[0]['status'],'CONFIRMED')
        self.assertEqual(captured[0]['values'],dict(occurrences=dates,visitorGuide=guide))

    def two_days(self):
        return [dict(startDate='2026-11-10',endDate='2026-11-10',startTime='10:00',endTime='18:00'),
                dict(startDate='2026-11-12',endDate='2026-11-12',startTime='13:00',endTime='20:00')]

    def test_times_from_two_dates_cannot_be_swapped(self):
        text='행사 일정: 2026.11.10 10:00 ~ 18:00 / 2026.11.12 13:00 ~ 20:00'
        good=self.two_days();self.assertEqual(self.confirm({'occurrences':good},text)['status'],'CONFIRMED')
        bad=copy.deepcopy(good);bad[0].update(startTime='13:00',endTime='20:00');bad[1].update(startTime='10:00',endTime='18:00')
        with self.assertRaises(RunError):self.confirm({'occurrences':bad},text)

    def test_commas_or_newlines_do_not_mix_other_dates_times(self):
        for separator in [', ','\n','; ']:
            text='행사 일정: 2026.11.10 10:00 ~ 18:00'+separator+'2026.11.12 13:00 ~ 20:00'
            with self.subTest(separator=separator):
                self.assertEqual(self.confirm({'occurrences':self.two_days()},text)['status'],'CONFIRMED')

    def test_a_multi_day_range_can_share_published_operating_times(self):
        for text in ['행사 기간: 2026.11.10 ~ 2026.11.13. 운영 시간 10:00 ~ 18:00',
                     '운영 시간 10:00 ~ 18:00. 행사 기간: 2026.11.10 ~ 2026.11.13',
                     '행사 기간: 2026.11.10~13 운영 시간 10:00 ~ 18:00']:
            dates=[dict(startDate='2026-11-10',endDate='2026-11-13',startTime='10:00',endTime='18:00')]
            with self.subTest(text=text):self.assertEqual(self.confirm({'occurrences':dates},text)['status'],'CONFIRMED')

    def test_separate_days_can_use_explicit_common_hours_before_or_after(self):
        dates=self.two_days();dates[1].update(startTime='10:00',endTime='18:00')
        for text in ['양일 운영 시간: 10:00 ~ 18:00. 행사 개최일: 2026.11.10, 2026.11.12',
                     '행사 개최일: 2026.11.10, 2026.11.12. 양일 운영 시간: 10:00 ~ 18:00']:
            with self.subTest(text=text):self.assertEqual(self.confirm({'occurrences':dates},text)['status'],'CONFIRMED')
        bad=copy.deepcopy(dates);bad[0].update(startTime='13:00',endTime='20:00')
        with self.assertRaises(RunError):self.confirm({'occurrences':bad},text)

    def test_a_specific_days_clock_overrides_common_hours(self):
        text='양일 운영 시간: 10:00 ~ 18:00. 행사 개최일: 2026.11.10 13:00 ~ 20:00 / 2026.11.12'
        dates=self.two_days();dates[0].update(startTime='13:00',endTime='20:00');dates[1].update(startTime='10:00',endTime='18:00')
        self.assertEqual(self.confirm({'occurrences':dates},text)['status'],'CONFIRMED')
        dates[0].update(startTime='10:00',endTime='18:00')
        with self.assertRaises(RunError):self.confirm({'occurrences':dates},text)

    def test_booking_clock_does_not_prove_event_opening_clock(self):
        text='행사 개최일: 2026.11.10. 운영 시간 10:00 ~ 18:00. 예약은 09:00 ~ 20:00 가능합니다.'
        bad=[dict(startDate='2026-11-10',endDate='2026-11-10',startTime='09:00',endTime='20:00')]
        with self.assertRaises(RunError):self.confirm({'occurrences':bad},text)
        bad[0].update(startTime='10:00',endTime='18:00')
        self.assertEqual(self.confirm({'occurrences':bad},text)['status'],'CONFIRMED')

    def test_iso_range_keeps_local_day_and_time_pair(self):
        text='행사 개최일 2026-11-10T23:00:00Z ~ 2026-11-13T10:00:00Z'
        dates=[dict(startDate='2026-11-11',endDate='2026-11-13',startTime='08:00',endTime='19:00')]
        self.assertEqual(self.confirm({'occurrences':dates},text)['status'],'CONFIRMED')

    def test_native_media_identity_is_preserved_in_source_fingerprint(self):
        detail=dict(images=[dict(url=self.url+'/poster.png',role='POSTER',nearbyText='포스터',
                    sectionHeadings=['행사 안내'],nativeLabels=['포스터'])])
        before=recheck.source_document(self.url,'같은 본문',detail)
        changed=copy.deepcopy(detail);changed['images'][0]['sectionHeadings']=['다른 행사']
        after=recheck.source_document(self.url,'같은 본문',changed)
        self.assertNotEqual(recheck.source_digest([before]),recheck.source_digest([after]))
        self.assertEqual(before['media'][0]['nativeLabels'],['포스터'])


if __name__=='__main__':unittest.main()
