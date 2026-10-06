"""Keep rejected discoveries as leads; verify location/type against read source text."""
import re
import unicodedata
from urllib.parse import urlsplit, urlunsplit
from catalog_rules import allowed_source
from rules import public_url, parse_date
from taxonomy import category_for
from event_detail_sources import tmm_product_url
from event_identity import name_matches, years, numbered_editions, source_date_ranges

TYPE_CUES = {
    'COMIC_DOUJIN':r'동인|코믹|comic|doujin', 'DOLL':r'인형|돌프리|프로젝트\s*돌|doll',
    'ONLY_EVENT':r'온리전|only\s*event', 'BIRTHDAY_CAFE':r'생일\s*카페|생카|birthday\s*caf',
    'FAN_CAFE':r'팬\s*카페|팬\s*이벤트|카페\s*이벤트|기념\s*카페|fan\s*caf',
    'SUBCULTURE_MUSIC':r'애니송|보컬로이드|버튜버|라이브\s*아이돌|아니쿠라|anisong|vocaloid|vtuber',
    'ANIME_GAME_FESTIVAL':r'애니|게임|anime|game', 'ART_BOOK':r'아트\s*북|art\s*book',
    'BOARD_GAME':r'보드\s*게임|board\s*game', 'CHARACTER_ART':r'캐릭터|character',
    'ILLUSTRATION':r'일러스트|illustrat', 'STATIONERY_GOODS':r'문구|굿즈|stationery',
    'CARD_COLLECTIBLES':r'카드|수집|트레이딩|card|collect', 'FAN_CONVENTION':r'팬|fan',
    'WINE':r'와인|주류|wine', 'WEDDING':r'웨딩|결혼|wedding',
    'LIFESTYLE':r'생활|리빙|홈|캠핑|베이비|반려|펫|인테리어|라이프|lifestyle|camping|home|baby',
    'DESIGN':r'디자인|design', 'BUSINESS':r'산업|비즈니스|기업|커피|식품|기술|전자|반도체|유학|교육|창업|브랜드|유통|매출|전문\s*전시|산업전|business|industrial|coffee|food\s*week',
    'WALK':r'걷기|산책|억새|공원|자연|등산|walk', 'LIGHT':r'빛|조명|불꽃|등불|유등|light',
    'MUSIC':r'음악|뮤직|공연|music', 'FOOD':r'음식|먹거리|미식|맥주|푸드|food|beer',
    'CULTURE':r'문화|예술|전통|역사|지역|축제|페스티벌|culture|festival',
    'CONCERT':r'콘서트|공연|concert', 'MUSIC_FESTIVAL':r'음악|뮤직|music',
    'POPUP_RETAIL':r'팝업|popup|pop.up', 'POPUP_EXPERIENCE':r'체험|experience',
    'POPUP_EXHIBITION':r'전시|exhibition', 'POPUP_MIXED':r'복합|체험|전시|mixed',
    'POPUP_STORE':r'팝업|popup|pop.up',
}


def rejected_leads(result, accepted, rejected, blocked):
    accepted_ids = {id(row) for row in accepted}
    leads, dropped = [], []
    for index, event in enumerate(result.get('events') or []):
        if id(event) in accepted_ids:
            continue
        sources = []
        for source in event.get('sources') or []:
            try:
                url = public_url(source.get('url'))
                allowed_source(url, blocked)
            except (ValueError, TypeError):
                continue
            sources.append(dict(url=url, kind='COMMUNITY', access='SNIPPET',
                                evidence='미검증 발견 단서. 개별 공식 원문에서 다시 확인해야 합니다.'))
        name = str(event.get('name') or '').strip()
        if not name or not sources:
            dropped.append(dict(index=index, name=name, reason='NO_SAFE_RESEARCH_SOURCE'))
            continue
        occurrences = []
        for row in event.get('occurrences') or []:
            try:
                start, end = parse_date(row.get('startDate')), parse_date(row.get('endDate'))
                if start <= end:
                    occurrences.append(dict(startDate=start.isoformat(), endDate=end.isoformat()))
            except (ValueError, TypeError):
                pass
        reasons = [reason for row in rejected if row.get('index') == index or
                   'index' not in row and row.get('name') == name for reason in row['reasons']]
        leads.append(dict(name=name, edition=event.get('edition'), organizer=event.get('organizer'),
                          venueName=event.get('venueName'), occurrences=occurrences, sources=sources,
                          verificationRequired=True, validationIssues=list(dict.fromkeys(reasons))))
    return leads, dropped


def normalized(text):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', str(text or ''))).casefold()


def same_page(first, second):
    # Listing navigation parameters do not identify a different event page.
    def key(url):
        value = urlsplit(url)
        return urlunsplit((value.scheme, value.netloc, value.path.rstrip('/'), value.query, ''))
    return key(first) == key(second)


def normalized_address(text):
    text = normalized(text)
    text = text.replace('서울특별시', '서울').replace('서울시', '서울').replace('경기도', '경기')
    text = re.sub(r'지하(\d+)층', r'b\1', text)
    text = re.sub(r'(\d+)(?:층|f)\b', r'\1f', text)
    return text


def venue_parts(name):
    values = re.split(r'\s*(?=Hall\b|The\s*Platz|더플라츠|제\s*\d+\s*전시장|오디토리움|컨퍼런스룸|[A-D]\s*홀)',str(name or ''),maxsplit=1,flags=re.I)
    return (values[0].strip(),values[1].strip()) if len(values)>1 and values[0].strip() else (str(name or '').strip(),'')


def normalized_venue(text):
    text = normalized(text).replace('coex','코엑스').replace('atcenter','at센터')
    return re.sub(r'[,·ㆍ()\-]', '', text)


def verify_facts(events, evidence, documents, blocked):
    """Only read documents prove facts. A model's quote alone is not evidence."""
    accepted, rejected = [], []
    by_index = {}
    for row in evidence or []:
        by_index.setdefault(row['eventIndex'], []).append(row)
    for index, event in enumerate(events):
        proofs = by_index.get(index, [])
        errors = []
        if len(proofs) != 1:
            errors.append('MISSING_OR_AMBIGUOUS_EVENT_FACT_EVIDENCE')
        else:
            proof = proofs[0]
            originals = [row['url'] for row in event.get('sources') or []
                         if row.get('kind') in ('OFFICIAL', 'VENUE', 'ORGANIZER_SOCIAL') or tmm_product_url(row['url'])]
            if not any(same_page(proof['sourceUrl'], url) for url in originals):
                errors.append('FACT_SOURCE_NOT_EVENT_ORIGINAL')
            for field in ('sourceUrl', 'addressSourceUrl'):
                try:
                    allowed_source(proof[field], blocked)
                    doc = documents.get(proof[field]) or {}
                    if doc.get('status') != 'READ':
                        errors.append('FACT_SOURCE_NOT_READ:' + field)
                except (ValueError, TypeError):
                    errors.append('UNSAFE_FACT_SOURCE:' + field)
            source_doc = documents.get(proof['sourceUrl']) or {}
            native_source_text = str(source_doc.get('title') or '')+'\n'+str(source_doc.get('bodyText') or '')
            source_text = normalized(native_source_text)
            address_text = normalized((documents.get(proof['addressSourceUrl']) or {}).get('bodyText'))
            name_quote = proof.get('nameQuote') or ''
            if not normalized(name_quote) or normalized(name_quote) not in source_text:
                errors.append('QUOTE_NOT_IN_READ_SOURCE:nameQuote')
            if not name_matches(event.get('name'), name_quote):
                errors.append('EVENT_NAME_NOT_IN_QUOTE')
            try:
                expected_years = {parse_date(o[key]).year for o in event.get('occurrences') or [] for key in ('startDate','endDate')}
            except (ValueError, TypeError, KeyError):
                expected_years = set(); errors.append('INVALID_EVENT_OCCURRENCE')
            if years(name_quote) and not years(name_quote).issubset(expected_years | years(event.get('name'))):
                errors.append('EVENT_EDITION_DISAGREES_WITH_SOURCE')
            edition = numbered_editions(str(event.get('name') or '') + ' ' + str(event.get('edition') or ''))
            if edition and numbered_editions(name_quote) and edition != numbered_editions(name_quote):
                errors.append('EVENT_EDITION_DISAGREES_WITH_SOURCE')
            occurrence_proofs = {}
            for row in proof.get('occurrenceEvidence') or []:
                occurrence_proofs.setdefault(row.get('occurrenceIndex'), []).append(row)
            occurrences = event.get('occurrences') or []
            if set(occurrence_proofs) != set(range(len(occurrences))) or any(len(rows)!=1 for rows in occurrence_proofs.values()):
                errors.append('MISSING_OR_AMBIGUOUS_OCCURRENCE_EVIDENCE')
            for occurrence_index, occurrence in enumerate(occurrences):
                rows = occurrence_proofs.get(occurrence_index) or []
                if len(rows) != 1: continue
                quote = rows[0].get('dateQuote') or ''
                if not normalized(quote) or normalized(quote) not in source_text:
                    errors.append('QUOTE_NOT_IN_READ_SOURCE:dateQuote')
                    continue
                try:
                    interval = (parse_date(occurrence['startDate']), parse_date(occurrence['endDate']))
                    if interval not in source_date_ranges(quote, native_source_text, name_quote):
                        errors.append('EVENT_DATES_NOT_SUPPORTED_BY_QUOTE:' + str(occurrence_index))
                except (ValueError, TypeError):
                    errors.append('INVALID_EVENT_OCCURRENCE:' + str(occurrence_index))
            for field, text in (('typeQuote', source_text), ('venueQuote', source_text)):
                if not normalized(proof.get(field)) or normalized(proof[field]) not in text:
                    errors.append('QUOTE_NOT_IN_READ_SOURCE:' + field)
            if not normalized_address(proof.get('addressQuote')) or normalized_address(proof['addressQuote']) not in normalized_address(
                    (documents.get(proof['addressSourceUrl']) or {}).get('bodyText')):
                # Postal codes/building aliases can appear in a different order.
                # The complete input street address (including its number/floor)
                # must still occur in both the quote and the actual document.
                actual = normalized_address(event.get('address'))
                original = normalized_address((documents.get(proof['addressSourceUrl']) or {}).get('bodyText'))
                if not actual or actual not in normalized_address(proof.get('addressQuote')) or actual not in original:
                    errors.append('QUOTE_NOT_IN_READ_SOURCE:addressQuote')
            core,qualifier = venue_parts(event.get('venueName'))
            whole_in_quote = normalized_venue(event.get('venueName')) in normalized_venue(proof.get('venueQuote'))
            parts_in_source = (core and qualifier and normalized_venue(core) in normalized_venue(source_text)
                               and normalized_venue(qualifier) in normalized_venue(proof.get('venueQuote')))
            if not core or not (whole_in_quote or parts_in_source):
                errors.append('EVENT_VENUE_NOT_IN_QUOTE')
            if proof['addressSourceUrl'] != proof['sourceUrl'] and normalized_venue(core) not in normalized_venue(address_text):
                errors.append('ADDRESS_SOURCE_NOT_CONNECTED_TO_EVENT_VENUE')
            footer = (documents.get(proof['addressSourceUrl']) or {}).get('footerAddresses') or []
            venue_domains = {'coex.co.kr','coexmagok.co.kr','at.or.kr','aroarohall.com','kintex.com','setec.or.kr','scc.or.kr'}
            host = urlsplit(proof['addressSourceUrl']).hostname or ''
            is_venue = any(host == domain or host.endswith('.'+domain) for domain in venue_domains)
            if any(normalized_address(event.get('address')) in normalized_address(address) for address in footer) and not is_venue:
                errors.append('SITE_FOOTER_ADDRESS_NEEDS_SEPARATE_VENUE_CONFIRMATION')
            document = normalized((documents.get(proof['addressSourceUrl']) or {}).get('bodyText'))
            location = document.find(normalized(event.get('address')))
            if location>=0 and not is_venue and re.search(r'사업자정보|사업자주소|사업장소재지|본사주소',document[max(0,location-100):location]):
                errors.append('BUSINESS_ADDRESS_IS_NOT_EVENT_LOCATION')
            if not event.get('address') or normalized_address(event['address']) not in normalized_address(proof.get('addressQuote')):
                errors.append('EVENT_ADDRESS_NOT_IN_QUOTE')
            address_quote = proof.get('addressQuote') or ''
            if re.search(r'사업자\s*(?:정보|등록|주소)|본사\s*주소|사업장\s*소재지', address_quote):
                errors.append('BUSINESS_ADDRESS_IS_NOT_EVENT_LOCATION')
            if proof.get('subcategory') != event.get('subcategory'):
                errors.append('EVENT_TYPE_DISAGREES_WITH_EVIDENCE')
            type_quote = proof.get('typeQuote') or ''
            if not re.search(TYPE_CUES.get(event.get('subcategory'),r'(?!)'), type_quote, re.I):
                errors.append('EVENT_TYPE_NOT_SUPPORTED_BY_QUOTE')
            if category_for(event.get('subcategory')) == 'FESTIVAL' and re.search(
                    r'박람회|산업\s*전시회|전문\s*전시회|trade\s+(?:show|fair)', type_quote, re.I):
                errors.append('TRADE_EXHIBITION_IS_NOT_FESTIVAL')
            if category_for(event.get('subcategory')) == 'SUBCULTURE' and event.get('subcategory') not in ('BIRTHDAY_CAFE','FAN_CAFE') and re.search(r'팝업\s*스토어|pop.up\s*store',type_quote,re.I):
                errors.append('POPUP_STORE_IS_NOT_SUBCULTURE_FORMAT')
        if errors:
            rejected.append(dict(index=index, name=event['name'], reasons=list(dict.fromkeys(errors))))
            continue
        # Geographic assignment follows the verified venue address, not the query
        # area, creator's business address, or the subject of the event.
        address = event['address'].strip()
        region = 'SEOUL' if address.startswith(('서울특별시', '서울시', '서울 ')) else 'GYEONGGI' if address.startswith(('경기도', '경기 ')) else None
        if region is None:
            rejected.append(dict(index=index, name=event['name'], reasons=['VENUE_OUTSIDE_SUPPORTED_REGION']))
            continue
        event['region'] = region
        if address.startswith('서울시 '):
            event['address'] = '서울특별시 ' + address[len('서울시 '):]
        districts = re.findall(r'(?:서울특별시|서울시|서울)\s+([가-힣]+구)\b', address)
        event['districts'] = list(dict.fromkeys(districts)) if region == 'SEOUL' else []
        for source in event.get('sources') or []:
            if same_page(source['url'], proof['sourceUrl']):
                source['access'] = 'ORIGINAL'
                if tmm_product_url(source['url']): source['kind'] = 'OFFICIAL'
                source['evidence'] = str(source.get('evidence') or '')[:1000] + ' 공개 원문을 직접 읽어 행사명·회차·개최일·유형과 개최 장소를 대조했습니다.'
        accepted.append(event)
    return accepted, rejected


def source_urls(result):
    return list(dict.fromkeys(url for proof in result.get('eventEvidence') or []
                             for url in (proof['sourceUrl'], proof['addressSourceUrl'])))
