"""Bounded, robots-aware public official feeds. Never executes page JavaScript."""
from urllib.parse import urlencode, urljoin, urlsplit
import time
import re
from event_detail_sources import allowed_by_robots
from media_fetch import check_url, public_addresses, PinnedHTTPS, request_target, MediaError, MAX_HTML_BYTES

HOSTS = ['www.lotteshopping.com', 'm.lotteshopping.com', 'www.ehyundai.com',
         'thehyundaiseoul.ehyundai.com', 'www.starfield.co.kr', 'www.shinsegae.com']
READ_POSTS = {'https://www.lotteshopping.com/contents/shpgInfoList'}
TYPES = {'text/html', 'application/xhtml+xml', 'application/json', 'text/plain'}


class OfficialHttp:
    def __init__(self, timeout=20):
        self.timeout = timeout
        self.robots = {}

    def __call__(self, url, body=None):
        if body is not None and url not in READ_POSTS:
            raise ValueError('Unreviewed official feed POST')
        deadline = time.monotonic() + self.timeout
        for _ in range(4):
            parsed, host = check_url(url, HOSTS)
            remaining = deadline-time.monotonic()
            if remaining <= 0: raise MediaError('Official feed deadline')
            if not allowed_by_robots(url, HOSTS, max(1,int(remaining)), self.robots):
                raise MediaError('Official feed robots denied')
            remaining = deadline-time.monotonic()
            if remaining <= 0: raise MediaError('Official feed deadline')
            connection = PinnedHTTPS(host, public_addresses(host,443)[0], min(10,remaining))
            try:
                connection.request('POST' if body is not None else 'GET',request_target(parsed),
                    body=urlencode(body) if body is not None else None,
                    headers={'Accept':'text/html,application/json,text/plain', 'Accept-Encoding':'identity',
                             'Content-Type':'application/x-www-form-urlencoded',
                             'User-Agent':'BoothHana-Catalog-Collector/1'})
                response = connection.getresponse()
                if response.status in (301,302,303,307,308):
                    destination=response.getheader('Location')
                    if not destination or body is not None:raise MediaError('Official POST/invalid redirect')
                    url=urljoin(url,destination);check_url(url,HOSTS);continue
                if response.status!=200:raise MediaError(f'Official feed HTTP {response.status}')
                if response.getheader('Content-Encoding','identity') not in ('','identity'):
                    raise MediaError('Compressed official feed rejected')
                type_header=response.getheader('Content-Type','')
                content_type=type_header.split(';')[0].strip().lower()
                if content_type not in TYPES:raise MediaError('Official feed content type changed')
                length=response.getheader('Content-Length')
                if length is not None and (not length.isdigit() or not 0<int(length)<=MAX_HTML_BYTES):
                    raise MediaError('Official feed size invalid')
                data=bytearray()
                while True:
                    remaining=deadline-time.monotonic()
                    if remaining<=0:raise MediaError('Official feed deadline')
                    if connection.sock:connection.sock.settimeout(min(10,remaining))
                    chunk=response.read(min(65536,MAX_HTML_BYTES+1-len(data)))
                    if not chunk:break
                    data.extend(chunk)
                    if len(data)>MAX_HTML_BYTES:raise MediaError('Official feed exceeds bound')
                if length is not None and len(data)!=int(length):raise MediaError('Truncated official feed')
                charset=re.search(r'charset\s*=\s*["\']?([\w-]+)',type_header,re.I)
                if not charset and content_type in ('text/html','application/xhtml+xml'):
                    charset=re.search(r'<meta\b[^>]*charset\s*=\s*["\']?([\w-]+)',bytes(data[:4096]).decode('latin-1'),re.I)
                encoding=charset[1].lower() if charset else 'utf-8'
                if encoding not in ('utf-8','utf8','euc-kr','cp949'):raise MediaError('Official feed charset unsupported')
                return bytes(data).decode('utf-8-sig' if encoding in ('utf-8','utf8') else encoding,'strict')
            finally:connection.close()
        raise MediaError('Official feed redirect limit')
