import unittest
from public_sources import PublicSources

URL = 'https://dongne.co/events/df2610/circles'

def card(ident, name, member, tags='', extra=''):
    return (f'<div class="rounded-lg neu-card relative grid">'
            '<div aria-hidden="true"><span>이미지 없음</span></div>'
            f'<div><h3><a class="stretched-link" href="/events/df2610/circles/{ident}">{name}</a></h3>'
            f'<p>{member} · 2부스</p><div><span>A-29</span></div></div>'
            f'<button aria-label="{name} 방문 예정"><span aria-hidden="true">별</span></button>'
            f'<div>{tags}</div>{extra}</div>')

def listing(rows):
    return ('<title>공식 참가 서클 목록</title><main>' + rows +
            '<div>전체 2개 중 1-2개 표시</div><span>1 / 1</span>'
            '<button disabled>다음 페이지</button></main>')

def read(body, url=URL):
    def fetch(address, hosts, **kwargs):
        return ('User-agent: *\nAllow: /', 'robots') if address.endswith('/robots.txt') else (body, 'raw-page-hash')
    return PublicSources([], fetch)([url])[0]

class DongneRosterCardTests(unittest.TestCase):
    def test_adjacent_booth_name_never_enters_preceding_card_evidence(self):
        body = listing(card(171577, '하나 스티치', 'nazo') +
                       card(172015, '수성 내행성 지점', 'W3', '<span data-chip><span>괴담에 떨어져도 출근을 해야 하는구나</span></span>'))
        doc = read(body)
        rows = doc['rosterEntries']
        self.assertEqual(['171577', '172015'], [r['sourceEntryId'] for r in rows])
        self.assertEqual('하나 스티치', rows[0]['registrationName'])
        self.assertIn('nazo', rows[0]['text'])
        self.assertNotIn('수성 내행성 지점', rows[0]['text'])
        self.assertNotIn('괴담에', rows[0]['text'])
        self.assertEqual([], rows[0]['tagLabels'])
        self.assertEqual(['괴담에 떨어져도 출근을 해야 하는구나'], rows[1]['tagLabels'])
        self.assertEqual('raw-page-hash', doc['sha256'])

    def test_full_original_work_tag_preserves_punctuation_and_suffix(self):
        rows = read(listing(card(171925, '지구 돌리자', '타라묘',
                                '<span data-chip><span>지. -지구의 운동에 대하여</span></span>') +
                            card(171577, '하나 스티치', 'nazo')))['rosterEntries']
        self.assertEqual(['지. -지구의 운동에 대하여'], rows[0]['tagLabels'])
        self.assertNotIn('하나 스티치', rows[0]['text'])

    def test_script_hidden_and_hydration_text_cannot_supply_card_facts(self):
        noise = ('<script>PRIVATE_ACCOUNT</script><div hidden>HIDDEN_SUBJECT</div>'
                 '<div aria-hidden="true">HIDDEN_MEMBER</div><template>OTHER_BOOTH</template>')
        rows = read(listing(card(171577, '하나 스티치', 'nazo', extra=noise) +
                            card(172015, '수성 내행성 지점', 'W3')))['rosterEntries']
        for hidden in ('PRIVATE_ACCOUNT', 'HIDDEN_SUBJECT', 'HIDDEN_MEMBER', 'OTHER_BOOTH'):
            self.assertNotIn(hidden, str(rows))

    def test_missing_or_nested_or_ambiguous_cards_do_not_emit_partial_row_mapping(self):
        plain = '<h3><a href="/events/df2610/circles/172015">수성 내행성 지점</a></h3>'
        cases = [card(171577, '하나 스티치', 'nazo') + plain,
                 card(171577, '하나 스티치', 'nazo', extra=card(172015, '수성 내행성 지점', 'W3')),
                 card(171577, '하나 스티치', 'nazo', extra='<h3><a class="stretched-link" href="/events/df2610/circles/172015">수성 내행성 지점</a></h3>')]
        for rows in cases:
            with self.subTest(rows=rows):
                self.assertNotIn('rosterEntries', read(listing(rows)))

    def test_unvalidated_page_or_other_host_never_exposes_roster_rows(self):
        body = listing(card(171577, '하나 스티치', 'nazo') + card(172015, '수성 내행성 지점', 'W3'))
        for url in (URL + '?page=2', URL + '?search=filter', URL.replace('dongne.co', 'example.com')):
            with self.subTest(url=url):
                self.assertNotIn('rosterEntries', read(body, url))

    def test_extraction_and_review_get_fresh_card_boundaries(self):
        bodies = iter([listing(card(171577, '하나 스티치', 'nazo') + card(172015, '수성 내행성 지점', 'W3')),
                       listing(card(171577, '하나 스티치 수정', 'nazo') + card(172015, '수성 내행성 지점', 'W3'))])
        def fetch(url, hosts, **kwargs):
            return ('User-agent: *\nAllow: /', 'robots') if url.endswith('/robots.txt') else (next(bodies), 'fresh-hash')
        source = PublicSources([], fetch)
        self.assertEqual('하나 스티치', source([URL])[0]['rosterEntries'][0]['registrationName'])
        self.assertEqual('하나 스티치 수정', source([URL])[0]['rosterEntries'][0]['registrationName'])
