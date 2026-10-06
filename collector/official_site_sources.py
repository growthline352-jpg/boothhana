"""Bounded Google Sites pages linked by an event's official sources.

Extract visible text, actual image URLs and same-site child pages. Never execute
scripts, follow login links or assume that a hosted page establishes image rights.
"""
from html.parser import HTMLParser
import hashlib
import re
from urllib.parse import urlsplit, urljoin, unquote, quote
from media_fetch import check_url, MAX_HTML_BYTES
from official_poster_sources import attachment_link, ImageHeadingContext, IMAGE_CONTEXT_POLICY

SITE_HOSTS = ['sites.google.com']
# Exact public Google image CDN hosts; every redirect remains DNS pinned.
SITE_IMAGE_HOSTS = SITE_HOSTS + ['lh%d.googleusercontent.com' % i for i in range(3, 8)] + ['lh%d-rt.googleusercontent.com' % i for i in range(3, 8)]


def site_detail_url(value):
    try:
        parsed = urlsplit(value)
        if parsed.scheme != 'https' or parsed.netloc != 'sites.google.com' or parsed.query: return None
        path = unquote(parsed.path)
        if re.search(r'%2f|%5c', parsed.path, re.I) or '\\' in path or '%' in path: return None
        parts = path.strip('/').split('/')
        if len(parts) < 2 or any(part in ('', '.', '..', '_') for part in parts): return None
        if parts[0] != 'view' and not re.fullmatch(r'[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', parts[0]): return None
        return 'https://sites.google.com/' + quote('/'.join(parts), safe='/%:@!$&()*+,;=-._~')
    except (ValueError, TypeError): return None


def site_root(url):
    canonical = site_detail_url(url)
    return '/'.join(canonical.split('/')[:5]) if canonical else None


class SiteHTML(HTMLParser):
    def __init__(self, page):
        super().__init__(convert_charrefs=True)
        self.page = page; self.parts = []; self.images = []; self.links = []; self.attachments = []; self.anchor = None; self.hidden = 0
        self.headings = ImageHeadingContext()

    def image(self, value, role, alt=''):
        if not value: return
        value = urljoin(self.page, value)
        try: check_url(value, SITE_IMAGE_HOSTS)
        except (ValueError, TypeError): return
        old = next((row for row in self.images if row['url'] == value), None)
        if old:
            old['nativeLabels'] = list(dict.fromkeys([*old['nativeLabels'], *([alt[:300]] if alt else [])]))
            old['sectionHeadings'] = list(dict.fromkeys([*old['sectionHeadings'], *self.headings.current()]))
        else:
            self.images.append(dict(url=value, role=role, nearbyText=alt[:300], nativeLabels=[alt[:300]] if alt else [], sectionHeadings=self.headings.current(), priority=0 if role == 'PAGE_PREVIEW' else 1))

    def handle_starttag(self, tag, attributes):
        a = dict(attributes)
        self.headings.start(tag, not self.hidden and tag not in ('script', 'style', 'template', 'iframe', 'nav', 'svg'))
        if tag == 'meta' and a.get('property') == 'og:image': self.image(a.get('content', ''), 'PAGE_PREVIEW')
        if tag in ('script', 'style', 'template', 'iframe', 'nav', 'svg'): self.hidden += 1
        if self.hidden: return
        if tag == 'img': self.image(a.get('src') or a.get('data-src') or '', 'CONTENT', a.get('alt', ''))
        if tag == 'a' and a.get('href'):
            self.anchor = [a['href'], '']
            link = site_detail_url(urljoin(self.page, a['href']))
            if link and site_root(link) == site_root(self.page) and link != self.page and link not in self.links: self.links.append(link)
        if tag in ('p', 'div', 'li', 'br', 'h1', 'h2', 'h3', 'h4', 'tr', 'dt'):
            self.parts.append('\n'); self.headings.text('\n')

    def handle_endtag(self, tag):
        self.headings.end(tag)
        if tag in ('script', 'style', 'template', 'iframe', 'nav', 'svg') and self.hidden: self.hidden -= 1
        if not self.hidden:
            separator=': ' if tag in ('th','dt') else ' ' if tag=='td' else '\n' if tag in ('p','div','li','h1','h2','h3','h4','tr','dd') else ''
            if separator:self.parts.append(separator); self.headings.text(separator)
        if tag == 'a' and self.anchor:
            attachment = attachment_link(self.page, *self.anchor); self.anchor = None
            if attachment and attachment not in self.attachments and len(self.attachments)<100: self.attachments.append(attachment)

    def handle_data(self, data):
        if not self.hidden:
            self.headings.data(data)
            self.parts.append(data)
            if self.anchor: self.anchor[1] = (self.anchor[1]+data)[:500]


def parse_site_document(html, page, checked_on, maximum_text=24000):
    canonical = site_detail_url(page)
    if not canonical or not isinstance(html, str) or len(html.encode('utf-8')) > MAX_HTML_BYTES: raise ValueError('Invalid official site document')
    parser = SiteHTML(canonical); parser.feed(html)
    text = re.sub(r'\n\s*\n+', '\n', re.sub(r'[ \t]+', ' ', ''.join(parser.parts))).strip()
    if not text: raise ValueError('Empty official site document')
    links = sorted(parser.links, key=lambda url: (not any(word in unquote(url).casefold() for word in ('주의', '안내', 'notice', 'ticket', 'guide')), url))
    return dict(sourceUrl=canonical, checkedOn=checked_on, sourceType='GOOGLE_SITES', imageContextPolicy=IMAGE_CONTEXT_POLICY, bodyText=text[:maximum_text], bodyContexts=parser.headings.body_contexts(),
        textTruncated=len(text)>maximum_text, images=parser.images[:40], imagesTruncated=len(parser.images)>40,
        childUrls=links[:20], linksTruncated=len(links)>20, attachments=parser.attachments, bodySha256=hashlib.sha256(html.encode('utf-8')).hexdigest())
