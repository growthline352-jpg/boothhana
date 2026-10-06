"""Read anonymous TMM and official Google Sites details for private analysis.

The public page is rendered from /prod/view. Only title, description and sale
dates are retained from that response; account/payment/customer data is excluded.
Remote text is untrusted input, never executable code or an instruction.
"""
from __future__ import annotations

from datetime import datetime
from copy import deepcopy
from html.parser import HTMLParser
import hashlib
from http.client import HTTPException
import json
from pathlib import Path
import re
import time
from urllib.parse import urlsplit, urljoin
from zoneinfo import ZoneInfo

from media_fetch import MediaError, PinnedHTTPS, check_url, public_addresses, request_target, fetch_image, fetch_html
from official_site_sources import site_detail_url, site_root, parse_site_document, SITE_HOSTS, SITE_IMAGE_HOSTS
from official_poster_sources import poster_detail_url,parse_poster_document,PLACEHOLDER_SHA256,attachment_link

PAGE_HOSTS = ['takemm.com']
API_HOSTS = ['api.takemm.com']
IMAGE_HOSTS = ['image.takemm.com', 'formimage.takemm.com']
AGENT = 'BoothHana-Public-Event-Collector/1'
MAX_DOCUMENT_BYTES = 2 * 1024 * 1024
MAX_TEXT = 24000


def tmm_product_url(value: str) -> str | None:
    try:
        parsed = urlsplit(value)
        if parsed.scheme != 'https' or parsed.netloc != 'takemm.com': return None
        match = re.fullmatch(r'/prod/view/([1-9][0-9]{0,11})/?', parsed.path)
        return 'https://takemm.com/prod/view/' + match[1] if match else None
    except (TypeError, ValueError): return None


class RobotsHTML(HTMLParser):
    """Read inert text when a server wraps robots rules in HTML; never execute it."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        if tag in ('br', 'p', 'div', 'pre'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.hidden: self.hidden -= 1
        if tag in ('p', 'div', 'pre'): self.parts.append('\n')
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)


def fetch_document(url: str, hosts: list[str], timeout: int, *, robots: bool = False, _redirects: int = 0, _deadline=None) -> bytes:
    parsed, host = check_url(url, hosts)
    addresses = public_addresses(host, 443)
    deadline = _deadline if _deadline is not None else time.monotonic() + timeout
    remaining = deadline - time.monotonic()
    if remaining <= 0: raise MediaError('Detail deadline exceeded')
    connection = PinnedHTTPS(host, addresses[0], min(10, remaining))
    try:
        connection.request('GET', request_target(parsed), headers={
            'User-Agent': AGENT, 'Accept': 'text/plain' if robots else 'application/json', 'Accept-Encoding': 'identity'})
        response = connection.getresponse()
        # RFC 9309 section 2.3.1.3 permits crawling when robots.txt is
        # unavailable (4xx). Object-store CDNs commonly use 403 for absent
        # keys. This applies ONLY to robots.txt; detail/image 403 stays denied.
        # Rate limits and server errors remain fail-closed. RFC 9309 requires
        # following at least five robots redirects, with the same pinned public
        # DNS/HTTPS host policy and one deadline for the entire chain.
        if robots and response.status in (301, 302, 303, 307, 308):
            target = response.getheader('Location')
            if not target or _redirects >= 5: raise MediaError('Robots redirect limit/missing target')
            target = urljoin(url, target)
            check_url(target, hosts)
            connection.close()
            return fetch_document(target, hosts, timeout, robots=True, _redirects=_redirects+1, _deadline=deadline)
        if robots and response.status in (403, 404, 410): return b''
        if response.status != 200: raise MediaError('Detail document HTTP failure')
        if response.getheader('Content-Encoding', 'identity') not in ('', 'identity'):
            raise MediaError('Compressed detail response rejected')
        content_type = response.getheader('Content-Type', '').split(';')[0].strip().lower()
        allowed = ('text/plain', 'text/html', 'application/xhtml+xml') if robots else ('application/json',)
        if content_type not in allowed: raise MediaError('Detail content type mismatch')
        maximum = 512 * 1024 if robots else MAX_DOCUMENT_BYTES
        length = response.getheader('Content-Length')
        if length is not None and (not length.isdigit() or not 0 <= int(length) <= maximum):
            raise MediaError('Declared detail size invalid')
        data = bytearray()
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0: raise MediaError('Detail deadline exceeded')
            if connection.sock is not None: connection.sock.settimeout(min(10, remaining))
            chunk = response.read(min(65536, maximum + 1 - len(data)))
            if not chunk: break
            data.extend(chunk)
            if len(data) > maximum: raise MediaError('Detail size limit')
        if length is not None and len(data) != int(length): raise MediaError('Truncated detail document')
        if robots and content_type in ('text/html', 'application/xhtml+xml'):
            parser = RobotsHTML()
            parser.feed(bytes(data).decode('utf-8-sig', 'strict'));parser.close()
            return ''.join(parser.parts).encode('utf-8')
        return bytes(data)
    finally:
        connection.close()


def allowed_by_robots(url: str, hosts: list[str], timeout: int, cache: dict) -> bool:
    parsed = urlsplit(url)
    origin = parsed.scheme + '://' + parsed.netloc
    if origin not in cache:
        raw = fetch_document(origin + '/robots.txt', hosts, timeout, robots=True)
        cache[origin] = raw.decode('utf-8-sig', 'strict')
    from robots_policy import allowed
    return allowed(cache[origin], AGENT, url)


class DetailHTML(HTMLParser):
    def __init__(self,page):
        super().__init__(convert_charrefs=True)
        self.page = page; self.attachments = []; self.anchor = None
        self.parts = []
        self.images = []
        self.hidden = 0

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag in ('script', 'style', 'template', 'iframe'): self.hidden += 1
        if self.hidden: return
        if tag == 'a' and attributes.get('href'): self.anchor = [attributes['href'],'']
        if tag == 'img':
            source = attributes.get('src') or ''
            try: check_url(source, IMAGE_HOSTS)
            except (ValueError, TypeError): return
            if not any(row['url'] == source for row in self.images):
                self.images.append({'url': source, 'offset': len(self.parts)})
        if tag in ('p', 'div', 'li', 'br', 'h1', 'h2', 'h3', 'h4'): self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'template', 'iframe') and self.hidden: self.hidden -= 1
        if not self.hidden and tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'h4'): self.parts.append('\n')
        if tag == 'a' and self.anchor:
            attachment = attachment_link(self.page, *self.anchor); self.anchor = None
            if attachment and attachment not in self.attachments and len(self.attachments)<100: self.attachments.append(attachment)

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)
            if self.anchor: self.anchor[1] = (self.anchor[1]+data)[:500]


def _label(value: str) -> str:
    # Regional indicator letters are frequently used as MENU/TABLE headings.
    value = ''.join(chr(ord(ch) - 0x1F1E6 + 65) if 0x1F1E6 <= ord(ch) <= 0x1F1FF else ch for ch in value)
    return re.sub(r'\s+', '', value).casefold()


def parse_tmm_product(raw: bytes, page_url: str, checked_on: str) -> dict:
    canonical = tmm_product_url(page_url)
    if not canonical: raise ValueError('Unsupported detail URL')
    if len(raw)>MAX_DOCUMENT_BYTES:raise ValueError('Detail size limit')
    value = json.loads(raw.decode('utf-8-sig', 'strict'))
    if not isinstance(value,dict) or value.get('code') != 'SUCCESS/': raise ValueError('Public detail unavailable or restricted')
    data=value.get('data')
    if not isinstance(data,dict) or not isinstance(data.get('prod_info'),dict):raise ValueError('Public product missing')
    product = data['prod_info']
    if str(product.get('prod_id')) != canonical.rsplit('/', 1)[1]: raise ValueError('Product ID mismatch')
    html = product.get('contents')
    title = product.get('title')
    if not isinstance(html, str) or not isinstance(title, str) or not html.strip() or len(html) > 250000:
        raise ValueError('No readable public product body')
    parser = DetailHTML(canonical); parser.feed(html)
    text = re.sub(r'[ \t]+', ' ', ''.join(parser.parts))
    text = re.sub(r'\n\s*\n+', '\n', text).strip()
    if not text: raise ValueError('No public detail text')
    images = []
    for index,image in enumerate(parser.images[:40]):
        offset = image['offset']
        # Stop at the next image: scanning the rest of the page incorrectly
        # labels every earlier decorative image as the later MENU section.
        end=parser.images[index+1]['offset'] if index+1<len(parser.images) else len(parser.parts)
        following = re.sub(r'\s+',' ',''.join(parser.parts[offset:end])).strip()[:220]
        preceding = ''.join(parser.parts[:offset])[-120:]
        previous_lines=[line.strip() for line in preceding.splitlines() if line.strip()]
        heading=previous_lines[-1] if previous_lines and len(previous_lines[-1])<=60 else ''
        label = _label(heading+' '+following)
        priority = 0 if any(key in label for key in ('menu', '메뉴', '가격')) else 1 if any(key in label for key in ('table', 'takeout', '입장', '예약')) else 2
        images.append(dict(url=image['url'], nearbyText=(preceding + '\n' + following).strip(), priority=priority))
    # The public product thumbnail is separate from contents. Reading only
    # body/menu images can miss the event's actual cover despite a valid URL.
    thumbnail=product.get('thumb_url')
    try:check_url(thumbnail,IMAGE_HOSTS)
    except (ValueError,TypeError,AttributeError):thumbnail=None
    if thumbnail:
        images=[image for image in images if image['url']!=thumbnail]
        images.insert(0,dict(url=thumbnail,nearbyText=title[:500],priority=-1,role='PAGE_PREVIEW'))
    images.sort(key=lambda row: row['priority'])
    # This is a strict public-fact allowlist. Never retain the raw response or
    # seller_data/user_data/bank/account/phone/email/password fields.
    return dict(sourceUrl=canonical, checkedOn=checked_on, title=title[:500], bodyText=text[:MAX_TEXT],
        textTruncated=len(text) > MAX_TEXT, reservationOpenRaw=_scalar(product.get('open_date')),
        reservationCloseRaw=_scalar(product.get('close_date')), formStateRaw=_scalar(product.get('status')),
        images=images[:40], imagesTruncated=len(parser.images)>40 or len(images)>40, attachments=parser.attachments, bodySha256=hashlib.sha256(html.encode('utf-8')).hexdigest())


def _scalar(value):
    return value[:100] if isinstance(value,str) else None


def collect_detail_sources(event: dict, directory: Path, blocked_hosts: list[str], timeout: int = 15,
                           *, fetcher=None, image_fetcher=None, robots_checker=None, html_fetcher=None) -> tuple[list[dict], list[Path]]:
    fetcher = fetcher or fetch_document
    image_fetcher = image_fetcher or fetch_image
    robots_checker = robots_checker or allowed_by_robots
    html_fetcher = html_fetcher or fetch_html
    urls = []
    for row in [*(event.get('sources') or []), *(event.get('discoveryLinks') or [])]:
        url = tmm_product_url(row.get('url'))
        if url and url not in urls: urls.append(url)
    site_urls = []
    for row in [*(event.get('sources') or []), *(event.get('discoveryLinks') or [])]:
        url = site_detail_url(row.get('url')) if row.get('kind') == 'OFFICIAL' else None
        if url and url not in site_urls: site_urls.append(url)
    roots = {site_root(url) for url in site_urls}
    for row in event.get('discoveryLinks') or []:
        url = site_detail_url(row.get('url'))
        if url and site_root(url) in roots and url not in site_urls: site_urls.append(url)
    poster_urls=[]
    for row in [*(event.get('sources') or []),*(event.get('discoveryLinks') or [])]:
        url=poster_detail_url(row.get('url')) if row.get('kind') in ('OFFICIAL','VENUE') else None
        if url and not tmm_product_url(url) and url not in poster_urls:poster_urls.append(url)
    if not urls and not site_urls and not poster_urls: return [], []
    directory.mkdir(parents=True, exist_ok=True)
    cache_file = directory / 'detail-sources.json'
    if cache_file.is_file():
        cache = json.loads(cache_file.read_text(encoding='utf-8'))
        if cache.get('blockedHosts', blocked_hosts) != blocked_hosts: raise ValueError('Detail checkpoint source policy changed; retry in a new job')
        files = [directory / item for item in cache['imageFiles']]
        if not cache_file.is_symlink() and len(files)<=4 and all(file.parent == directory and file.is_file() and not file.is_symlink() for file in files):
            return cache['observations'], files
        raise ValueError('Detail analysis checkpoint images missing')
    blocked = [host.removeprefix('*.') for host in blocked_hosts]
    deadline = time.monotonic() + 60
    robots_cache = {}
    observations, files = [], []
    checked = datetime.now(ZoneInfo('Asia/Seoul')).date().isoformat()

    def permitted(url, hosts):
        host = urlsplit(url).hostname or ''
        if any(host == item or host.endswith('.' + item) for item in blocked): return False
        remaining = max(1, min(timeout, int(deadline - time.monotonic())))
        if time.monotonic() >= deadline: raise MediaError('Detail job time limit')
        return robots_checker(url, hosts, remaining, robots_cache)

    def attach_images(item, hosts):
        # Blocked CDN hosts must stay blocked across every redirect too.
        hosts = [host for host in hosts if not any(host == entry or host.endswith('.'+entry) for entry in blocked)]
        for image in item['images']:
            image['analysisStatus'] = 'NOT_READ'
            if len(files) >= 4: continue
            try:
                if not permitted(image['url'], hosts): image['analysisStatus'] = 'BLOCKED'; continue
                trace=[]
                options={'source_trace':trace,'url_guard':lambda url:permitted(url,hosts),'user_agent':AGENT} if image_fetcher is fetch_image else {}
                raw_image, mime, digest = image_fetcher(image['url'], hosts, max(1, min(timeout, int(deadline-time.monotonic()))), **options)
                if item.get('sourceType')=='OFFICIAL_POSTER_PAGE' and digest in PLACEHOLDER_SHA256:
                    image['analysisStatus']='PLACEHOLDER';continue
                suffix = {'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif'}[mime]
                path = directory / ('detail-image-' + str(len(files)) + suffix)
                path.write_bytes(raw_image); path.chmod(0o600); files.append(path)
                image.update(analysisStatus='ATTACHED', imageFile=path.name, sha256=digest, contentType=mime, fetchedUrls=trace)
            except (ValueError, OSError, KeyError, HTTPException): image['analysisStatus'] = 'INACCESSIBLE'

    for page in urls[:2]:
        item = dict(sourceUrl=page, checkedOn=checked, status='INACCESSIBLE', images=[])
        try:
            api_url = 'https://api.takemm.com/prod/view?last_selection_id=' + page.rsplit('/', 1)[1]
            if not permitted(page, PAGE_HOSTS) or not permitted(api_url, API_HOSTS):
                item['status'] = 'BLOCKED'; observations.append(item); continue
            raw = fetcher(api_url, API_HOSTS, max(1, min(timeout, int(deadline-time.monotonic()))))
            item = dict(parse_tmm_product(raw, page, checked), status='READ')
            attach_images(item, IMAGE_HOSTS)
        except (ValueError, OSError, TypeError, KeyError, HTTPException):
            item = dict(sourceUrl=page, checkedOn=checked, status='INACCESSIBLE', images=[])
        observations.append(item)
    # Bounded second pass: official landing page first, then same-site notices.
    # Read fresh HTML each new job: Google Sites image URLs are signed and can expire.
    index = 0
    while index < min(3, len(site_urls)):
        page = site_urls[index]; index += 1
        item = dict(sourceUrl=page, checkedOn=checked, status='INACCESSIBLE', sourceType='GOOGLE_SITES', images=[])
        try:
            if not permitted(page, SITE_HOSTS): item['status']='BLOCKED'
            else:
                html, _ = html_fetcher(page, SITE_HOSTS, max(1, min(timeout, int(deadline-time.monotonic()))))
                item = dict(parse_site_document(html, page, checked, maximum_text=32000), status='READ')
                attach_images(item, SITE_IMAGE_HOSTS)
                for child in item['childUrls']:
                    if child not in site_urls: site_urls.append(child)
        except (ValueError, OSError, TypeError, KeyError, HTTPException): pass
        observations.append(item)
    for page in poster_urls[:2]:
        host=urlsplit(page).hostname;item=dict(sourceUrl=page,checkedOn=checked,status='INACCESSIBLE',sourceType='OFFICIAL_POSTER_PAGE',images=[])
        try:
            if not permitted(page,[host]):item['status']='BLOCKED'
            else:
                html,_=html_fetcher(page,[host],max(1,min(timeout,int(deadline-time.monotonic()))))
                item=dict(parse_poster_document(html,page,checked,event.get('name')),status='READ')
                hosts=list(dict.fromkeys(urlsplit(image['url']).hostname for image in item['images']))
                attach_images(item,hosts)
        except (ValueError,OSError,TypeError,KeyError,HTTPException):pass
        observations.append(item)
    visited = {item['sourceUrl'] for item in observations}
    for item in observations:
        if item.get('sourceType') == 'GOOGLE_SITES':
            item['unreadChildUrls'] = [url for url in item.get('childUrls', []) if url not in visited]
    cache_file.write_text(json.dumps(dict(observations=observations, imageFiles=[file.name for file in files], blockedHosts=blocked_hosts), ensure_ascii=False, indent=2), encoding='utf-8')
    cache_file.chmod(0o600)
    return observations, files


def detail_coverage_issues(event: dict, observations: list[dict]) -> list[str]:
    guide = event.get('visitorGuide') or {}
    issues = []
    for row in observations:
        if row.get('status') != 'READ':
            issues.append('DETAIL_SOURCE_' + row.get('status', 'INACCESSIBLE')); continue
        label = _label(row.get('bodyText', ''))
        if any(word in label for word in ('menu', '메뉴', '음료', '디저트')) and not guide.get('sales'):
            issues.append('MISSING_DETAIL_MENU')
        if any(word in label for word in ('qr', '취소', '양도', '입장', '특전')) and not guide.get('faq'):
            issues.append('MISSING_DETAIL_VISIT_FAQ')
        if any(word in label for word in ('table', 'takeout', '예약')) and not guide.get('tickets') and not guide.get('faq'):
            issues.append('MISSING_DETAIL_RESERVATION')
        if row.get('textTruncated'): issues.append('DETAIL_TEXT_TRUNCATED')
        if row.get('linksTruncated') or row.get('unreadChildUrls'): issues.append('DETAIL_CHILD_PAGES_NOT_FULLY_READ')
        if row.get('sourceType') == 'GOOGLE_SITES' and any(image.get('role') == 'PAGE_PREVIEW' and image.get('analysisStatus') == 'ATTACHED' for image in row.get('images', [])) and not any(b.get('matchesEdition') is True and b.get('pageUrl') == row['sourceUrl'] for b in event.get('banners') or []):
            issues.append('MISSING_DETAIL_BANNER')
        if row.get('imagesTruncated'): issues.append('DETAIL_IMAGES_NOT_FULLY_READ')
        if any(image.get('analysisStatus')=='PLACEHOLDER' for image in row.get('images',[])):issues.append('DETAIL_PLACEHOLDER_IMAGE')
        if any(image.get('analysisStatus') in ('INACCESSIBLE', 'BLOCKED') for image in row.get('images', [])):
            issues.append('DETAIL_IMAGE_INACCESSIBLE')
        if any(image.get('analysisStatus')=='NOT_READ' for image in row.get('images', [])):
            issues.append('DETAIL_IMAGES_NOT_FULLY_READ')
    return list(dict.fromkeys(issues))


def normalize_detail_sales_dates(result: dict, observations: list[dict]) -> tuple[dict,list[str]]:
    """Retain only the known calendar date of an exactly copied unzoned API time.

    No timezone inference and no repair of other guessed/malformed timestamps.
    The normal validator still rejects those. Existing reviewed data is merged
    later, so this cannot remove a reviewed time or change its date.
    """
    output=deepcopy(result);changed=False
    sources={row['sourceUrl']:row for row in observations if row.get('status')=='READ'}
    for event in output.get('events') or []:
        for kind in ('tickets','sales'):
            for row in (event.get('visitorGuide') or {}).get(kind) or []:
                source=sources.get(tmm_product_url(row.get('sourceUrl')))
                if not source:continue
                for field,raw_field in (('salesStartsAt','reservationOpenRaw'),('salesEndsAt','reservationCloseRaw')):
                    value,raw=row.get(field),source.get(raw_field)
                    if not isinstance(value,str) or len(value)<=10 or not isinstance(raw,str) or len(raw)<=10:continue
                    try:
                        timestamp=datetime.fromisoformat(value.replace('Z','+00:00'))
                        original=datetime.fromisoformat(raw.replace('Z','+00:00'))
                    except ValueError:continue
                    if timestamp.tzinfo is None and original.tzinfo is None and timestamp==original:
                        row[field]=original.date().isoformat();changed=True
    if changed:
        if output.get('searchStatus')=='COMPLETE':output['searchStatus']='PARTIAL'
        output['summary']=(output.get('summary','')+' 원문 예약 시각의 시간대 미확인: 확인된 날짜만 기록했습니다.')[:2000]
    return output,['DETAIL_SALES_TIMEZONE_UNCONFIRMED'] if changed else []
