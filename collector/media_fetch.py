"""Bounded public image retrieval. Exact host allowlist + DNS-to-connection pinning on every redirect.
Does not inherit proxy settings, send cookies, crawl pages, resize, or transform third-party works.
"""
from __future__ import annotations
import hashlib,http.client,ipaddress,io,socket,ssl,time,warnings
from urllib.parse import quote,urlsplit,urljoin
from PIL import Image,UnidentifiedImageError
from rules import public_url
MAX_BYTES=10*1024*1024
MAX_HTML_BYTES=4*1024*1024
MAX_PIXELS=25_000_000
class MediaError(ValueError): pass

def normalize_image_content_type(value: str):
    """Accept the common but non-standard image/jpg response as JPEG."""
    value=value.split(';')[0].strip().lower()
    return 'image/jpeg' if value in ('image/jpg','image/pjpeg') else value

def verified_content_type(data: bytes,declared: str,max_pixels: int=MAX_PIXELS):
    """An omitted HTTP type is not a file format. Sniff only verified raster bytes.

    Explicit image/HTML types are never overridden. All candidates retain the
    same byte, pixel, decompression and complete-file validation limits.
    """
    if declared not in ('','application/octet-stream'):return declared,inspect_image(data,declared,max_pixels)
    for mime in ('image/jpeg','image/png','image/webp','image/gif'):
        try:return mime,inspect_image(data,mime,max_pixels)
        except MediaError:pass
    raise MediaError('Missing/generic content type without a valid bounded raster image')

def public_addresses(host: str,port: int,resolver=socket.getaddrinfo):
    addresses=[]
    for row in resolver(host,port,type=socket.SOCK_STREAM):
        value=row[4][0];ip=ipaddress.ip_address(value)
        # Mixed private/public DNS is rejected, not filtered. Prevent rebinding/fallback routes.
        if not ip.is_global or ip.is_multicast or ip.is_unspecified: raise MediaError('DNS resolves to a non-public address')
        if value not in addresses: addresses.append(value)
    if not addresses: raise MediaError('No public DNS address')
    return addresses

def check_url(url: str,hosts: list[str]):
    public_url(url);parsed=urlsplit(url);host=parsed.hostname.rstrip('.').lower()
    if parsed.scheme!='https' or parsed.port not in (None,443): raise MediaError('External image requires HTTPS/443')
    if not any(host==entry.lower() or (entry.startswith('*.') and host.endswith(entry[1:].lower()) and host!=entry[2:].lower()) for entry in hosts): raise MediaError('Image host is not in administrator allowlist')
    return parsed,host

class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self,host,ip,timeout): super().__init__(host,timeout=timeout,context=ssl.create_default_context());self.ip=ip
    def connect(self):
        self.sock=socket.create_connection((self.ip,443),self.timeout)
        self.sock=self._context.wrap_socket(self.sock,server_hostname=self.host)

def request_target(parsed):
    """Encode Unicode paths without double-encoding existing percent escapes."""
    path=quote(parsed.path or '/',safe="/%:@!$&'()*+,;=-._~")
    query=quote(parsed.query,safe="=&;%:+,?/@!$'()*-._~")
    return path+('?' + query if query else '')

def inspect_image(data: bytes,content_type: str,max_pixels: int=MAX_PIXELS):
    if not data or len(data)>MAX_BYTES: raise MediaError('Image size outside 1..10MiB')
    # Pillow reports iPhone multi-picture JPEGs as MPO; browsers and our upload
    # signature validation safely consume their JPEG-compatible first frame.
    expected={'JPEG':'image/jpeg','MPO':'image/jpeg','PNG':'image/png','WEBP':'image/webp','GIF':'image/gif'}
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error' if max_pixels<=MAX_PIXELS else 'ignore',Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                kind=expected.get(image.format)
                if kind!=content_type or image.width*image.height>max_pixels: raise MediaError('Image format/pixel limit mismatch')
                image.verify()
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError,Image.DecompressionBombWarning) as exc: raise MediaError('Invalid image') from exc
    return hashlib.sha256(data).hexdigest()

def fetch_image(url: str,hosts: list[str],timeout: int=30,max_pixels: int=MAX_PIXELS,*,source_trace=None):
    deadline=time.monotonic()+timeout
    for _ in range(4):
        parsed,host=check_url(url,hosts);addresses=public_addresses(host,443)
        if source_trace is not None:source_trace.append(url)
        remaining=deadline-time.monotonic()
        if remaining<=0: raise MediaError('Image deadline exceeded')
        connection=PinnedHTTPS(host,addresses[0],min(10,remaining))
        try:
            path=request_target(parsed)
            connection.request('GET',path,headers={'User-Agent':'BoothHana-Approved-Image-Fetcher/4','Accept':'image/png,image/jpeg,image/webp,image/gif','Accept-Encoding':'identity'})
            response=connection.getresponse()
            if response.status in (301,302,303,307,308):
                target=response.getheader('Location')
                if not target: raise MediaError('Redirect missing destination')
                url=urljoin(url,target);continue
            if response.status!=200: raise MediaError(f'Image HTTP {response.status}')
            if response.getheader('Content-Encoding','identity') not in ('identity',''): raise MediaError('Compressed transport not accepted')
            type_=normalize_image_content_type(response.getheader('Content-Type',''))
            length=response.getheader('Content-Length')
            if length is not None and (not length.isdigit() or not 0<int(length)<=MAX_BYTES): raise MediaError('Declared image size invalid')
            data=bytearray()
            while True:
                remaining=deadline-time.monotonic()
                if remaining<=0: raise MediaError('Image deadline exceeded')
                if connection.sock is not None: connection.sock.settimeout(min(10,remaining))
                chunk=response.read(min(65536,MAX_BYTES+1-len(data)))
                if not chunk: break
                data.extend(chunk)
                if len(data)>MAX_BYTES: raise MediaError('Actual image exceeds 10MiB')
            if length is not None and len(data)!=int(length): raise MediaError('Truncated image')
            result=bytes(data);type_,digest=verified_content_type(result,type_,max_pixels)
            return result,type_,digest
        finally: connection.close()
    raise MediaError('Too many image redirects')

def fetch_html(url: str,hosts: list[str],timeout: int=30):
    """Fetch a reviewed public HTML floorplan page with the same SSRF controls as images."""
    deadline=time.monotonic()+timeout
    for _ in range(4):
        parsed,host=check_url(url,hosts);addresses=public_addresses(host,443)
        remaining=deadline-time.monotonic()
        if remaining<=0:raise MediaError('HTML deadline exceeded')
        connection=PinnedHTTPS(host,addresses[0],min(10,remaining))
        try:
            path=request_target(parsed)
            connection.request('GET',path,headers={'User-Agent':'BoothHana-Approved-Floorplan-Fetcher/1','Accept':'text/html','Accept-Encoding':'identity'})
            response=connection.getresponse()
            if response.status in (301,302,303,307,308):
                target=response.getheader('Location')
                if not target:raise MediaError('Redirect missing destination')
                url=urljoin(url,target);continue
            if response.status!=200:raise MediaError(f'HTML HTTP {response.status}')
            if response.getheader('Content-Encoding','identity') not in ('identity',''):raise MediaError('Compressed transport not accepted')
            type_=response.getheader('Content-Type','').split(';')[0].strip().lower()
            if type_ not in ('text/html','application/xhtml+xml'):raise MediaError('Floorplan page is not HTML')
            length=response.getheader('Content-Length')
            if length is not None and (not length.isdigit() or not 0<int(length)<=MAX_HTML_BYTES):raise MediaError('Declared HTML size invalid')
            data=bytearray()
            while True:
                remaining=deadline-time.monotonic()
                if remaining<=0:raise MediaError('HTML deadline exceeded')
                if connection.sock is not None:connection.sock.settimeout(min(10,remaining))
                chunk=response.read(min(65536,MAX_HTML_BYTES+1-len(data)))
                if not chunk:break
                data.extend(chunk)
                if len(data)>MAX_HTML_BYTES:raise MediaError('HTML exceeds 4MiB')
            if length is not None and len(data)!=int(length):raise MediaError('Truncated HTML')
            raw=bytes(data)
            try:text=raw.decode('utf-8-sig','strict')
            except UnicodeDecodeError as exc:raise MediaError('Floorplan HTML must be UTF-8') from exc
            return text,hashlib.sha256(raw).hexdigest()
        finally:connection.close()
    raise MediaError('Too many HTML redirects')
