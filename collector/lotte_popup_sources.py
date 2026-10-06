"""Source-backed Lotte World Mall popup inventory; never publishes or approves media.

The public shopping-news POST is pagination, not a write operation. Dates come
from the detail's explicit year-bearing literals, not thumbnail paths or badges.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from html.parser import HTMLParser
import hashlib
from pathlib import Path
import re
import time
from urllib.parse import urlencode, urlsplit, parse_qs

from event_detail_sources import allowed_by_robots
from media_fetch import MAX_HTML_BYTES, MediaError, PinnedHTTPS, check_url, public_addresses, request_target
from run import write_json

BOOTSTRAP = 'https://www.lotteshopping.com/contents/shpgInfo?cstrCd=0002'
LIST_URL = 'https://www.lotteshopping.com/contents/shpgInfoList'
DETAIL_BASE = 'https://m.lotteshopping.com/shpgnews/shpgnewsDetail?shpgNewsNo='
HOSTS = ['www.lotteshopping.com', 'm.lotteshopping.com']
POPUP = re.compile(r'팝업|pop\s*[-–]?\s*up', re.I)
PERMANENT = re.compile(r'new\s+open|grand\s+open|new\s+arrival|할인\s*프로모션', re.I)
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


@dataclass
class Node:
    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()

    def has(self, class_name):
        return class_name in self.attrs.get('class', '').split()

    def text(self):
        if self.tag in ('script', 'style'):
            return ''
        return ' '.join(' '.join(c.text() if isinstance(c, Node) else c for c in self.children).split())


class Tree(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node('root')
        self.stack = [self.root]
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        if len(self.stack) > 100:
            raise ValueError('Official HTML nesting limit')
        node = Node(tag, {k: v or '' for k, v in attrs})
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_data(self, value):
        self.stack[-1].children.append(value)


def class_text(root, name):
    return [n.text() for n in root.walk() if n.has(name)]


def parse_page(html, page):
    root = Tree(html).root
    cards = []
    for node in root.walk():
        if not node.has('content-item'):
            continue
        ids = set(re.findall(r"(?:goUrl|goCntsLink)\(\s*['\"]C00903['\"]\s*,\s*['\"](SNM\d{17})['\"]", ' '.join(n.attrs.get('onclick', '') for n in node.walk())))
        title, location = class_text(node, '__title'), class_text(node, '__info')
        if len(ids) != 1 or len(title) != 1 or len(location) != 1:
            raise ValueError('Shopping-news card identity/title/location changed')
        cards.append(dict(id=ids.pop(), title=title[0], location=location[0]))
    # Parse inert literals only. No JavaScript evaluation or inferred pagination.
    def literal(name, pattern):
        values = re.findall(r"\[name=['\"]" + name + r"['\"]\].*?\.val\(\s*['\"](" + pattern + r")[ '\"]*\)", html)
        if len(set(values)) != 1:
            raise ValueError('Shopping-news pagination missing/conflicting: ' + name)
        return values[0]
    next_page = int(literal('page', r'\d+'))
    has_next = literal('hasNextYn', '[YN]') == 'Y'
    total = int(literal('totalCnt', r'\d+'))
    if next_page not in ((page + 1,) if has_next else (page, page + 1)) or total < len(cards) or (has_next and not cards):
        raise ValueError('Shopping-news pagination stalled/invalid')
    return cards, has_next, total


def parse_detail(html, card, first, last):
    root = Tree(html).root
    meta = {n.attrs.get('property'): n.attrs.get('content', '').strip() for n in root.walk() if n.tag == 'meta'}
    source = DETAIL_BASE + card['id']
    canonical = urlsplit(meta.get('og:url', ''))
    if canonical.scheme != 'https' or canonical.hostname != 'm.lotteshopping.com' or canonical.port not in (None, 443) or canonical.username or canonical.path != '/shpgnews/shpgnewsDetail' or parse_qs(canonical.query).get('shpgNewsNo') != [card['id']]:
        raise ValueError('Shopping-news detail identity mismatch')
    titles, dates, places = [class_text(root, key) for key in ('__detail-title', '__date', '__place')]
    locations = class_text(root, '__location')
    if len(titles) != 1 or len(dates) != 1 or len(places) != 1 or not locations or locations[0] != '백화점 잠실점' or not ('월드몰' in locations[:2] or '월드몰' in places[0]):
        raise ValueError('Detail location/title/date missing or not Jamsil World Mall')
    title = titles[0]
    # A popup in a department-store card cannot silently become a World Mall row.
    if '잠실점' not in card['location'] or '월드몰' not in card['location']:
        raise ValueError('Listing/detail branch mismatch')
    body = ' '.join(class_text(root, '__txt-desc'))
    if PERMANENT.search(title) or not POPUP.search(title + ' ' + places[0] + ' ' + body):
        return None
    exact = []
    for key in ('cntsStDtm', 'cntsEndDtm'):
        values = re.findall(r'lddi\.ShareLink\.appData\.' + key + r"\s*=\s*['\"](\d{14})['\"]\s*;", html)
        if len(set(values)) != 1:
            raise ValueError('Missing/conflicting explicit event year: ' + key)
        exact.append(datetime.strptime(values[0], '%Y%m%d%H%M%S').date())
    start, end = exact
    visible = re.fullmatch(r'\s*(\d{1,2})\.(\d{1,2})\([^)]*\)\s*~\s*(\d{1,2})\.(\d{1,2})\([^)]*\)\s*', dates[0])
    if not visible or tuple(map(int, visible.groups())) != (start.month, start.day, end.month, end.day) or end < start:
        raise ValueError('Explicit dates conflict with visible event range')
    if end < first or start > last:
        return None
    image = meta.get('og:image', '')
    image_url = urlsplit(image)
    banners = []
    if image_url.scheme == 'https' and image_url.hostname == 'minfo.lotteshopping.com' and image_url.port in (None, 443) and not image_url.username and '/'+card['id']+'/' in image_url.path:
        banners = [dict(imageUrl=image, pageUrl=source, rights='UNKNOWN', rightsEvidence=None, matchesEdition=True)]
    warnings = ['입장료·예약 방식·운영시간은 공식 공지에서 확인 필요']
    # Marketing captions may contain a different opening day. Keep the authoritative
    # header and flag the discrepancy for review instead of hiding it.
    captions = class_text(root, '__txt-caption')
    if any(re.search(r'\d{1,2}\.\d{1,2}.*~', c) and c != dates[0] for c in captions):
        warnings.append('공식 본문 날짜와 상단 행사 날짜의 차이 확인 필요')
    if not banners:
        warnings.append('행사 ID와 일치하는 공식 대표 이미지 미확인')
    text = title + ' ' + body
    topic_patterns = {'CHARACTER_IP':r'캐릭터|산리오|포켓몬|짱구|스펀지밥|먼작귀', 'ANIME_MANGA':r'애니|만화|웹툰',
                      'FASHION':r'패션|의류|니트|슈즈|웨어|스파오|알파인더스트리', 'BEAUTY':r'뷰티|향수|바이레도',
                      'FOOD_DRINK':r'먹거리|음료|피자|농가의\s*하루|바삭', 'ART_DESIGN':r'글쓰기|필기\s*문화|몽블랑', 'SPORTS':r'축구|스포츠|LALIGA'}
    subjects = [key for key, pattern in topic_patterns.items() if re.search(pattern, text, re.I)]
    retail_topics = {'FASHION', 'BEAUTY', 'FOOD_DRINK', 'CHARACTER_IP'}
    kind = 'POPUP_EXPERIENCE' if not retail_topics.intersection(subjects) and re.search(r'직접\s*경험|직접\s*만년필|체험형', body) and not re.search(r'판매|구매|굿즈', body) else 'POPUP_RETAIL'
    return dict(name=title + ' · 롯데월드몰', subcategory=kind, organizer='롯데백화점 잠실점', edition=str(start.year), region='SEOUL',
                venueName=places[0] if '월드몰' in places[0] else '롯데월드몰 ' + places[0], address='서울특별시 송파구 올림픽로 300',
                description=(body or title)[:2000], admission=None, subjects=subjects,
                occurrences=[dict(startDate=start.isoformat(), endDate=end.isoformat(), startTime=None, endTime=None)],
                sources=[dict(url=source, kind='OFFICIAL', access='ORIGINAL', evidence=(title + ' / '+dates[0]+' / 월드몰 '+places[0])[:240])],
                banners=banners, warnings=warnings, eventFormat='SINGLE_HOST',
                discoveryLinks=[dict(kind='OFFICIAL', url=source, status='PUBLISHED', note='주최 쇼핑뉴스 원문')],
                operationStatus=dict(state='SCHEDULED', note='공식 쇼핑뉴스에 안내된 행사 일정', sourceUrl=source, checkedOn=first.isoformat()))


class OfficialSource:
    def __init__(self, timeout=15):
        self.timeout = min(30, max(1, timeout))
        self.robots = {}

    def get(self, url, body=None):
        parsed, host = check_url(url, HOSTS)
        if not allowed_by_robots(url, [host], self.timeout, self.robots):
            raise MediaError('Official source robots policy denied')
        if body is not None and url != LIST_URL:
            raise ValueError('Only the fixed read-only inventory POST is allowed')
        deadline = time.monotonic() + self.timeout
        connection = PinnedHTTPS(host, public_addresses(host, 443)[0], min(10, self.timeout))
        try:
            connection.request('POST' if body is not None else 'GET', request_target(parsed), body=urlencode(body) if body is not None else None, headers={
                'Content-Type':'application/x-www-form-urlencoded', 'Accept':'text/html', 'Accept-Encoding':'identity',
                'User-Agent':'BoothHana-Catalog-Collector/1', 'Referer':BOOTSTRAP})
            response = connection.getresponse()
            if response.status != 200 or response.getheader('Content-Type', '').split(';')[0].strip().lower() not in ('text/html', 'application/xhtml+xml'):
                raise MediaError('Official inventory response is not HTTP 200 HTML')
            if response.getheader('Content-Encoding', 'identity') not in ('identity', ''):
                raise MediaError('Compressed official inventory not accepted')
            length = response.getheader('Content-Length')
            if length is not None and (not length.isdigit() or not 0 < int(length) <= MAX_HTML_BYTES):
                raise MediaError('Invalid official inventory content length')
            data = bytearray()
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise MediaError('Official inventory deadline exceeded')
                if connection.sock is not None:
                    connection.sock.settimeout(min(10, remaining))
                chunk = response.read(min(65536, MAX_HTML_BYTES + 1 - len(data)))
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > MAX_HTML_BYTES:
                    raise MediaError('Official inventory exceeds HTML bound')
            if length is not None and len(data) != int(length):
                raise MediaError('Truncated official inventory')
            return bytes(data).decode('utf-8-sig', 'strict')
        finally:
            connection.close()


def collect(scope, folder: Path, *, fetch=None, max_pages=30, max_details=40, max_seconds=300, heartbeat=None):
    """Collect complete bounded inventory, while retaining valid rows on partial failure."""
    folder.mkdir(parents=True, exist_ok=True)
    first, last = date.fromisoformat(scope['startDate']), date.fromisoformat(scope['endDate'])
    fetch = fetch or OfficialSource().get
    deadline = time.monotonic() + max_seconds
    events, cards, issues, trace, seen = [], [], [], [], set()
    total, complete = None, False

    def read(url, key, body=None):
        if time.monotonic() >= deadline:
            raise ValueError('Official inventory runtime budget reached')
        if heartbeat:
            heartbeat()
        html = fetch(url, body)
        raw = html.encode('utf-8')
        if not raw or len(raw) > MAX_HTML_BYTES:
            raise ValueError('Official source HTML size invalid')
        (folder/(key+'.html')).write_bytes(raw)
        trace.append(dict(url=url, request=body, sha256=hashlib.sha256(raw).hexdigest(), path=key+'.html'))
        return html

    try:
        bootstrap = read(BOOTSTRAP, 'bootstrap')
        if 'C00903' not in bootstrap or '잠실점' not in bootstrap or '/contents/shpgInfoList' not in bootstrap:
            raise ValueError('Official branch bootstrap changed')
        for page in range(1, max_pages + 1):
            html = read(LIST_URL, 'list-'+str(page), dict(cntsTpCd='C00903', page=page, size=12, totalCnt=total or 0, cstrCd='0002', ctegryLrclsCdList=''))
            rows, more, count = parse_page(html, page)
            if total is not None and total != count:
                raise ValueError('Official inventory total changed during pagination')
            total = count
            ids = [r['id'] for r in rows]
            if len(set(ids)) != len(ids) or seen.intersection(ids):
                raise ValueError('Official inventory repeated news IDs')
            seen.update(ids)
            # Read Mall details even without "popup" in the title (e.g. themed
            # brand experiences). Confirm popup semantics in the official body.
            cards.extend(r for r in rows if '잠실점' in r['location'] and '월드몰' in r['location'] and not PERMANENT.search(r['title']))
            if not more:
                if len(seen) != total:
                    raise ValueError('Official inventory ended before reported total')
                complete = True
                break
        if not complete:
            issues.append('Official inventory page budget reached')
    except Exception as exc:
        issues.append(str(exc)[:300])
    for card in cards[:max_details]:
        try:
            row = parse_detail(read(DETAIL_BASE+card['id'], card['id']), card, first, last)
            if row:
                events.append(row)
        except Exception as exc:
            issues.append(card['id']+': '+str(exc)[:240])
    if len(cards) > max_details:
        issues.append('Official popup detail budget reached')
    status = 'PARTIAL' if issues else 'COMPLETE'
    # Legacy ingestion requires a query description even for MANUAL_IMPORT.
    # Describe the actual fixed-source inventory query, never a claimed web search.
    inventory_query = '롯데 잠실점(0002) 공식 쇼핑뉴스(C00903) 전체 페이지 조회 · 월드몰 팝업 상세 확인'
    result = dict(schemaVersion='1', searchStatus=status, summary=f'롯데월드몰 공식 쇼핑뉴스 {len(seen)}/{total}개, 팝업 후보 {len(cards)}개, 기간 내 {len(events)}개 확인', queries=[inventory_query],
                  sourceCoverage=[dict(channel='ORGANIZER_OFFICIAL', status='PARTIAL' if issues else 'CHECKED', queries=[],
                                       checkedUrls=list(dict.fromkeys(r['url'] for r in trace))[:50], notes='공식 잠실점 목록 전체 페이지와 연도 포함 상세 날짜 확인. '+('; '.join(issues))[:350])], events=events)
    write_json(folder/'source-trace.json', dict(reportedTotal=total, observedCards=len(seen), popupCards=len(cards), paginationComplete=complete, issues=issues, requests=trace))
    write_json(folder/'result.json', result)
    return result
