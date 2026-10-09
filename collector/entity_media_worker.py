"""Verified SUBJECT/CREATOR/PRODUCT image completion; no model or cost fallback.

Candidates are leads, not permission. Each publication needs two independent
image-attached calls, fresh original documents, matching bytes and a public read.
No network runs on import. Callers can shard targets and inject their API bridge.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit

from graph_worker import COMMON, MODEL, Worker as GraphWorker, arr, configuration, obj, string
from media_fetch import fetch_html, fetch_image, inspect_image
from public_sources import PublicSources, illustar_notice, kakao_pr_article
from run import CliUnavailable, RunError, canonical_audit_url, execute_search, write_json
from transport import DeliveryError

PREFIX = '/api/internal/subculture/v6/media'
KINDS = ('SUBJECT', 'CREATOR', 'PRODUCT')
EXTENSIONS = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif'}
DISCOVERY_SCHEMA = obj({
    'status': {'type': 'string', 'enum': ['FOUND', 'DEFERRED']},
    'candidates': arr(obj({'imageUrl': string(), 'pageUrl': string(), 'usageSourceUrl': string(), 'reason': string()})),
    'reason': string(),
})
EXTRACTION_SCHEMA = obj({
    'status': {'type': 'string', 'enum': ['CANDIDATE', 'UNRESOLVED']},
    'candidate': {'anyOf': [{'type': 'null'}, obj({
        'caption': {'type': 'string', 'maxLength': 500},
        'credit': {'type': 'string', 'minLength': 1, 'maxLength': 1000},
        'identityEvidence': {'type': 'string', 'minLength': 1, 'maxLength': 2000},
        'usageStatus': {'type': 'string', 'enum': ['PERMITTED', 'UNKNOWN', 'FORBIDDEN']},
        'usageEvidence': {'type': 'string', 'minLength': 1, 'maxLength': 2000},
        'usageSourceUrl': string(),
    })]},
    'reason': string(),
})
REVIEW_SCHEMA = obj({'verdict': {'type': 'string', 'enum': ['APPROVE', 'REJECT', 'ENRICH']},
                     'reason': {'type': 'string', 'minLength': 1, 'maxLength': 2000}})
DISCOVERY_PROMPT = '''대상의 대표 이미지 후보를 여러 공식 출처에서 조사하라. 기존 원문의 작가 귀속·작품·캐릭터·개별 상품 옵션을 대조하라.
실제 공개 원문에 포함된 이미지 URL과 그 원문 pageUrl만 제출한다. 이름만 같은 계정, 팬 업로드, 검색 썸네일, 사이트 로고를 대상 이미지로 만들지 말라.
작가/서클은 공식 아바타/대표 그림/허용된 사진을 조사하고 상품 사진을 작가 초상으로 바꾸지 말라. 상품은 해당 옵션이 실제 표현된 사진/판매표만 후보로 삼는다.
사용 조건이 별도 페이지에 있으면 usageSourceUrl을 기록하고, 없으면 원문 pageUrl을 기록한다. 공개 게시 자체를 재게시 허락으로 취급하지 말라.
없는 후보는 status=DEFERRED,candidates=[]로 남긴다. 아직 원문을 못 읽은 결과를 완료로 표시하지 말라.'''
EXTRACTION_PROMPT = '''첨부된 실제 이미지를 보고 대상에 대응하는 대표 이미지인지 추출하라. nativeImages는 이 원문 HTML에 실제 포함된 이미지이지 동일성 정답이 아니다.
원문 pageUrl과 대상의 기존 identitySource 양쪽 자료로 정체성을 확인한다. 작품·캐릭터의 소속, 동명 작가/서클, 공동 판매표의 귀속, 개별 상품 옵션을 분리한다.
상품 판매표 전체와 다른 옵션의 사진, 로고, 기본 아바타를 해당 상품/작가 이미지로 선택하지 말라. 다른 캐릭터이면 UNRESOLVED로 남긴다.
사용 조건 원문으로 BoothHana가 이미지를 다운로드·저장·재게시할 수 있는 명시적 허락/적용 라이선스가 확인될 때만 PERMITTED.
Commons는 해당 파일의 imageinfo/extmetadata와 파일 설명의 라이선스를 대조한다. Commons 전역 footer/본문 텍스트의 CC0를 이미지 파일의 허락으로 오인하지 말라. 출처 표시·동일 조건 등 의무가 있으면 credit에 필요한 표시를 남겨야 한다.
공식 사이트라는 사실, 원문 공개, 핫링크 가능, 이미지 분석 가능은 재게시 허락이 아니다. 미확인은 UNKNOWN, 명시적 금지는 FORBIDDEN.
usageEvidence에 실제 조건과 적용 근거를 기록한다. 별도 조건 원문을 발견하면 그 정확한 usageSourceUrl을 반환한다. 아직 못 읽었으면 허락을 확정하지 말라.
caption·credit·identityEvidence를 근거에 맞게 작성한다. 동일성 자체가 불명확하면 status=UNRESOLVED,candidate=null.
첨부 바이트 SHA와 URL은 서버가 기록한다. 모델이 해시를 만들거나 이미지 URL을 바꾸지 않는다.'''
REVIEW_PROMPT = '''너는 앞선 추출과 별도 실행하는 독립 검토자다. 후보를 정답으로 여기지 말고 새로 첨부된 실제 이미지와 새로 읽은 원문을 대조하라.
대상의 기존 원문과 이미지 원문 양쪽으로 동명이인·작품 소속·캐릭터·공동 부스 귀속·상품 옵션·대표 이미지 적합성을 확인한다.
작가/서클의 상품 사진을 초상으로, 판매표의 다른 옵션을 이 상품으로, 팬 그림을 공식 캐릭터 대표 이미지로 만들면 REJECT.
재게시 권한은 원문의 명시적 허락/라이선스와 이 이미지·사용 목적에 적용되는 근거가 필요하다. 공식/공개/분석 허용만으로 APPROVE하지 않는다.
Commons 전역 footer의 CC0를 파일 자체의 권한으로 쓰면 ENRICH. 해당 파일 metadata·라이선스·저자·필수 출처표시가 정확히 대응해야 한다.
동일성과 명시적 재게시 권한이 모두 입증되고 candidate.usageStatus=PERMITTED이면 APPROVE. 다른 대상/명시적 금지는 REJECT.
같은 대상이지만 권리·귀속·원문 근거가 부족하면 ENRICH. UNKNOWN은 승인할 수 없다. 구체적인 reason을 남긴다.'''


def _https(value):
    if not isinstance(value, str):
        return False
    try:
        parsed = urlsplit(value)
        return parsed.scheme == 'https' and bool(parsed.hostname) and not parsed.username and not parsed.password and parsed.port in (None, 443) and bool(canonical_audit_url(value))
    except (TypeError, ValueError):
        return False


def identity_urls(value):
    """Match server identity traversal; image leads are never identity evidence."""
    result = []

    def add(url):
        if _https(url) and url not in result:
            result.append(url)

    def walk(item):
        if isinstance(item, dict):
            for key, child in item.items():
                if key in ('sourceUrl', 'profileUrl', 'productUrl', 'url') and isinstance(child, str):
                    add(child)
                elif key in ('officialLinks', 'links') and isinstance(child, list):
                    for link in child:
                        if isinstance(link, str):
                            add(link)
                elif key not in ('images', 'banners', 'existingMedia'):
                    walk(child)
        elif isinstance(item, list):
            for child in item:
                walk(child)

    walk(value)
    return result


class NativeImages(HTMLParser):
    """Parse native HTML/CSS/JSON-LD references; never execute arbitrary script."""
    def __init__(self, page):
        super().__init__(convert_charrefs=True)
        self.page, self.images, self.capture = page, [], None

    def add(self, value, role, alt=''):
        if not isinstance(value, str):
            return
        url = urljoin(self.page, value.strip())
        if _https(url) and not any(i['imageUrl'] == url for i in self.images):
            self.images.append({'imageUrl': url, 'role': role, 'alt': alt})

    def css(self, text):
        for value in re.findall(r'url\(\s*[\"\']?([^\"\')]+)', text, re.I):
            self.add(value, 'CSS')

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('img', 'source'):
            for key in ('src', 'data-src', 'data-original', 'data-lazy-src'):
                if attrs.get(key):
                    self.add(attrs[key], 'CONTENT', attrs.get('alt', ''))
            for key in ('srcset', 'data-srcset'):
                for entry in attrs.get(key, '').split(','):
                    if entry.strip():
                        self.add(entry.strip().split()[0], 'CONTENT', attrs.get('alt', ''))
        if tag == 'meta' and (attrs.get('property') or attrs.get('name', '')).lower() in ('og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'):
            self.add(attrs.get('content'), 'SOCIAL')
        if tag == 'link' and (attrs.get('rel') == 'image_src' or attrs.get('rel') == 'preload' and attrs.get('as') == 'image'):
            self.add(attrs.get('href'), 'LINK')
        if attrs.get('style'):
            self.css(attrs['style'])
        if tag == 'style' or tag == 'script' and attrs.get('type', '').lower() == 'application/ld+json':
            self.capture = (tag, [])

    def handle_data(self, text):
        if self.capture:
            self.capture[1].append(text)

    def handle_endtag(self, tag):
        if self.capture and self.capture[0] == tag:
            body = ''.join(self.capture[1])
            self.capture = None
            if tag == 'style':
                self.css(body)
            else:
                try:
                    self.structured(json.loads(body))
                except (ValueError, RecursionError):
                    pass

    def structured(self, value, image=False):
        if isinstance(value, dict):
            for key, child in value.items():
                relevant = key in ('image', 'thumbnailUrl', 'logo') or image and key in ('url', 'contentUrl')
                self.structured(child, relevant)
        elif isinstance(value, list):
            for child in value:
                self.structured(child, image)
        elif image:
            self.add(value, 'STRUCTURED')


class NativeSources:
    """Keep native image association alongside independently captured originals."""
    def __init__(self, blocked, fetch=fetch_html):
        self.blocked, self.fetch = blocked, fetch

    def __call__(self, urls):
        bodies = {}

        def capture(url, hosts, **kwargs):
            commons = commons_imageinfo(url)
            if commons:
                kwargs['allow_json'] = True
            body, digest = self.fetch(url, hosts, **kwargs)
            bodies[url] = body
            if commons:
                # A specific, unauthenticated public file metadata endpoint.
                # Digest remains that of the fetched JSON, not this text view.
                body = '<title>Commons file imageinfo</title><pre>' + escape(body) + '</pre>'
            return body, digest

        documents = PublicSources(self.blocked, fetch=capture)(urls)
        for doc in documents:
            if not doc['available']:
                continue
            transport = doc.get('transportUrl', doc['url'])
            body = bodies.get(transport, '')
            if commons_imageinfo(transport):
                data = json.loads(body)
                pages = data.get('query', {}).get('pages', {})
                rows = pages.values() if isinstance(pages, dict) else pages if isinstance(pages, list) else []
                doc['nativeImages'] = [{'imageUrl': info[key], 'role': 'FILE_METADATA', 'alt': row.get('title', '')}
                                       for row in rows if isinstance(row, dict)
                                       for info in row.get('imageinfo', []) if isinstance(info, dict)
                                       for key in ('url', 'thumburl') if _https(info.get(key))]
                continue
            if transport != doc['url'] and transport.startswith('https://api.illustar.net/v1/notice/'):
                body = illustar_notice(body)
            body = kakao_pr_article(doc['url'], body)
            parser = NativeImages(doc['url'])
            parser.feed(body)
            doc['nativeImages'] = parser.images
        return documents


def commons_imageinfo(url):
    parsed = urlsplit(url)
    query = parse_qs(parsed.query)
    return parsed.scheme == 'https' and parsed.hostname == 'commons.wikimedia.org' and parsed.path == '/w/api.php' and set(query) <= {'action', 'format', 'prop', 'iiprop', 'iiurlwidth', 'titles', 'formatversion'} and query.get('action') == ['query'] and query.get('format') == ['json'] and query.get('prop') == ['imageinfo'] and len(query.get('titles', [])) == 1 and query['titles'][0].startswith('File:')


class EntityMediaWorker:
    def __init__(self, cfg=None, api=None, search=execute_search, source_loader=None, image_fetcher=fetch_image):
        self.cfg = dict(cfg if cfg is not None else configuration())
        if self.cfg.get('model') != MODEL:
            raise RunError('Entity media requires explicit gpt-6.1-sol; null/fallback is disabled')
        self.sources = source_loader or NativeSources(self.cfg['blockedSourceHosts'])
        self.image_fetcher = image_fetcher
        self.caller = GraphWorker(self.cfg, api=api, search=search, source_loader=self.sources)
        self.api = self.caller.api
        self.root = self.caller.root / 'entity-media'

    def request(self, method, path, body=None, **kwargs):
        return self.api.request(method, PREFIX + path, body, **kwargs)

    @staticmethod
    def validate_context(context):
        kind, target = context.get('kind'), str(context.get('targetId', ''))
        digest = context.get('targetHash')
        if kind not in KINDS or not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest) or not isinstance(context.get('target'), dict):
            raise RunError('Invalid entity media context')
        if kind == 'CREATOR':
            if not target.isdecimal() or int(target) <= 0:
                raise RunError('Invalid creator target ID')
        else:
            try:
                if str(uuid.UUID(target)) != target:
                    raise ValueError()
            except ValueError:
                raise RunError('Invalid entity target ID') from None
        return kind, target

    def context(self, kind, target_id):
        if kind not in KINDS:
            raise RunError('Invalid entity kind')
        return self.request('GET', '/context?' + urlencode({'kind': kind, 'targetId': target_id}))

    def targets(self, kind, after_id='', limit=100):
        if kind not in KINDS or type(limit) is not int or not 1 <= limit <= 100:
            raise RunError('Invalid entity target page')
        seen = {str(after_id)}
        while True:
            page = self.request('GET', '/targets?' + urlencode({'kind': kind, 'afterId': after_id, 'limit': limit}))
            if not isinstance(page, dict) or not isinstance(page.get('items'), list) or type(page.get('hasMore')) is not bool:
                raise RunError('Invalid entity target response')
            for context in page['items']:
                actual_kind, _ = self.validate_context(context)
                if actual_kind != kind:
                    raise RunError('Wrong kind in entity target page')
                yield context
            if not page['hasMore']:
                return
            after_id = str(page.get('afterId', ''))
            if not after_id or after_id in seen:
                raise RunError('Entity target cursor did not advance')
            seen.add(after_id)

    def _call(self, directory, prompt, schema, images, documents, version):
        # Documents were fetched immediately for this phase; do not secretly
        # re-fetch a different snapshot between native association and the call.
        prior = self.caller.source_loader
        self.caller.source_loader = lambda urls: documents
        try:
            result, audit = self.caller.call(directory, COMMON + prompt, schema, images, [d['url'] for d in documents])
        finally:
            self.caller.source_loader = prior
        audit['promptVersion'] = version
        write_json(directory / 'audit.json', audit)
        return result, audit

    def _documents(self, context, page, usage, identity=None):
        if not _https(page) or not _https(usage):
            raise RunError('INVALID_SOURCE_URL')
        required = list(dict.fromkeys([page, usage] + ([identity] if identity else [])))
        loaded = {d['url']: d for d in self.sources(required)}
        if any(not loaded.get(url, {}).get('available') for url in required):
            raise RunError('SOURCE_UNAVAILABLE')
        identities = identity_urls(context['target'])
        chosen = identity if identity in identities else next((u for u in required if u in identities), None)
        if not chosen:
            for url in identities:
                docs = self.sources([url])
                found = next((d for d in docs if d.get('url') == url and d.get('available')), None)
                if found:
                    loaded[url] = found
                    required.append(url)
                    chosen = url
                    break
        if not chosen:
            raise RunError('IDENTITY_SOURCE_UNAVAILABLE')
        return [loaded[url] for url in required], chosen

    def _image(self, url):
        if not _https(url):
            raise RunError('INVALID_IMAGE_URL')
        host = urlsplit(url).hostname.lower()
        blocked = self.cfg['blockedSourceHosts']
        guard = lambda u: _https(u) and not any((urlsplit(u).hostname or '').lower() == b or (urlsplit(u).hostname or '').lower().endswith('.' + b) for b in blocked)
        if not guard(url):
            raise RunError('BLOCKED_IMAGE_HOST')
        raw, mime, claimed = self.image_fetcher(url, [host], timeout=self.cfg['httpTimeoutSeconds'], url_guard=guard)
        digest = inspect_image(raw, mime)
        if claimed != digest:
            raise RunError('FETCH_IMAGE_HASH_MISMATCH')
        return raw, mime, digest

    @staticmethod
    def _native(documents, page, image):
        doc = next(d for d in documents if d['url'] == page)
        if not any(canonical_audit_url(i.get('imageUrl', '')) == canonical_audit_url(image) for i in doc.get('nativeImages', [])):
            raise RunError('IMAGE_NOT_IN_ORIGINAL_PAGE')

    @staticmethod
    def _image_file(directory, image):
        raw, mime, digest = image
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / (digest + EXTENSIONS[mime])
        path.write_bytes(raw)
        return path

    @staticmethod
    def _hashes(documents):
        return {d['url']: d['sha256'] for d in documents if d.get('available', True)}

    def _publish(self, context, receipt, image):
        raw, mime, digest = image
        if receipt.get('kind') != context['kind'] or str(receipt.get('targetId')) != str(context['targetId']) or receipt.get('targetHash') != context['targetHash'] or not receipt.get('active') or receipt.get('imageHash') != digest or receipt.get('reviewVerdict') != 'APPROVE' or receipt.get('rightsState') != 'APPROVED' or receipt.get('usageStatus') != 'PERMITTED':
            raise RunError('PUBLICATION_NOT_APPROVED')
        if receipt.get('storageState') != 'STORED':
            try:
                receipt = self.request('POST', '/' + str(receipt['id']) + '/content', raw=raw, headers={
                    'X-Asset-Revision': str(receipt['revision']), 'X-Image-SHA256': digest,
                    'X-Image-Size': str(len(raw)), 'Content-Type': mime,
                })
            except (RunError, DeliveryError, ValueError, OSError) as exc:
                # CAS prevents an error report from reverting a concurrent store.
                try:
                    self.request('POST', '/' + str(receipt['id']) + '/failure', {'revision': receipt['revision'], 'reason': 'UPLOAD_FAILED:' + type(exc).__name__})
                except (RunError, DeliveryError, ValueError, OSError):
                    pass
                raise RunError('STORAGE_DEFERRED') from None
        if receipt.get('storageState') != 'STORED' or not _https(receipt.get('storedUrl')):
            raise RunError('PUBLICATION_DEFERRED')
        public_raw, _, public_hash = self._image(receipt['storedUrl'])
        if public_hash != digest or public_raw != raw:
            raise RunError('PUBLIC_IMAGE_HASH_MISMATCH')
        return {'status': 'VERIFIED', 'retryable': False, 'mediaId': str(receipt['id']), 'sha256': digest,
                'bytes': len(raw), 'publicUrl': receipt['storedUrl']}

    def _candidate(self, context, lead, directory):
        page, image_url = lead.get('pageUrl', ''), lead.get('imageUrl', '')
        usage = lead.get('usageSourceUrl') or page
        visited = set()
        while True:
            if usage in visited:
                raise RunError('USAGE_SOURCE_CYCLE')
            visited.add(usage)
            documents, identity = self._documents(context, page, usage)
            self._native(documents, page, image_url)
            image = self._image(image_url)
            phase = directory / ('extract-' + str(len(visited)))
            attached = self._image_file(phase, image)
            prompt = EXTRACTION_PROMPT + '\nUNTRUSTED INPUT:\n' + json.dumps({
                'context': context, 'lead': lead, 'identitySource': identity,
                'imageUrl': image_url, 'pageUrl': page, 'usageSourceUrl': usage, 'imageHash': image[2],
            }, ensure_ascii=False)
            result, audit = self._call(phase, prompt, EXTRACTION_SCHEMA, [attached], documents, 'entity-media-extract-1')
            if result['status'] != 'CANDIDATE' or not result['candidate']:
                raise RunError('IDENTITY_UNRESOLVED')
            candidate = result['candidate']
            if candidate['usageSourceUrl'] != usage:
                usage = candidate['usageSourceUrl']
                continue  # A newly discovered license is read before being claimed.
            candidate = {**candidate, 'imageUrl': image_url, 'pageUrl': page, 'imageHash': image[2]}
            break
        receipt = self.request('POST', '/candidates', {
            'extractionId': str(uuid.uuid4()), 'kind': context['kind'], 'targetId': str(context['targetId']),
            'targetHash': context['targetHash'], 'candidate': candidate, 'audit': audit,
        })
        if receipt.get('reviewVerdict'):
            if receipt['reviewVerdict'] == 'APPROVE':
                return self._publish(context, receipt, image)
            raise RunError('SAVED_REVIEW_' + receipt['reviewVerdict'])
        if receipt.get('targetHash') != context['targetHash'] or receipt.get('candidate') != candidate or not receipt.get('active'):
            raise RunError('EXTRACTION_RECEIPT_MISMATCH')
        fresh, _ = self._documents(context, page, usage, identity)
        self._native(fresh, page, image_url)
        fresh_image = self._image(image_url)
        if fresh_image[2] != image[2]:
            raise RunError('IMAGE_CHANGED_REEXTRACT')
        old_hashes, fresh_hashes = self._hashes(documents), self._hashes(fresh)
        if any(fresh_hashes.get(url) != digest for url, digest in old_hashes.items()):
            raise RunError('SOURCE_CHANGED_REEXTRACT')
        review_dir = directory / 'review'
        attached = self._image_file(review_dir, fresh_image)
        prompt = REVIEW_PROMPT + '\nUNTRUSTED REVIEW INPUT:\n' + json.dumps({
            'context': context, 'candidate': candidate, 'identitySource': identity, 'imageHash': fresh_image[2],
        }, ensure_ascii=False)
        decision, reviewed = self._call(review_dir, prompt, REVIEW_SCHEMA, [attached], fresh, 'entity-media-review-1')
        if candidate['usageStatus'] == 'FORBIDDEN':
            decision = {'verdict': 'REJECT', 'reason': '명시적 사용 금지. ' + decision['reason'][:1900]}
        elif candidate['usageStatus'] != 'PERMITTED' and decision['verdict'] == 'APPROVE':
            decision = {'verdict': 'ENRICH', 'reason': '재게시 권한 미확인. ' + decision['reason'][:1900]}
        receipt = self.request('POST', '/' + str(receipt['id']) + '/review', {
            'revision': receipt['revision'], 'extractionId': receipt['extractionId'], 'resultHash': receipt['resultHash'],
            **decision, 'audit': reviewed,
        })
        if decision['verdict'] != 'APPROVE':
            raise RunError('REVIEW_' + decision['verdict'])
        return self._publish(context, receipt, fresh_image)

    def _seeds(self, context, seed):
        if isinstance(seed, dict):
            seed = seed.get('candidates', [seed])
        if not isinstance(seed, list):
            return []
        result, seen = [], set()
        for lead in seed:
            if not isinstance(lead, dict):
                continue
            lead_kind = 'SUBJECT' if lead.get('kind') in ('WORK', 'CHARACTER') and lead.get('subjectId') else lead.get('kind', context['kind'])
            if lead_kind != context['kind'] or str(lead.get('targetId', lead.get('subjectId', context['targetId']))) != str(context['targetId']):
                continue
            identity = (lead.get('imageUrl'), lead.get('pageUrl'), lead.get('usageSourceUrl'))
            if all(_https(u) for u in identity[:2]) and (not identity[2] or _https(identity[2])) and identity not in seen:
                seen.add(identity)
                result.append(lead)
        return result

    def run_target(self, context, seed=None):
        kind, target = self.validate_context(context)
        directory = self.root / kind.lower() / target / str(uuid.uuid4())
        directory.mkdir(parents=True, exist_ok=True)
        attempts = []
        write_json(directory / 'context.json', context)
        try:
            # Approved immutable reviews can resume a failed delivery without
            # repeating the model. The exact reviewed SHA is still mandatory.
            for saved in context.get('existingMedia', []):
                if saved.get('reviewVerdict') != 'APPROVE' or saved.get('targetHash') != context['targetHash']:
                    continue
                try:
                    receipt = self.request('GET', '/' + str(uuid.UUID(str(saved['id']))))
                    url = receipt.get('storedUrl') if receipt.get('storageState') == 'STORED' else receipt.get('imageUrl')
                    result = self._publish(context, receipt, self._image(url))
                    write_json(directory / 'report.json', result)
                    return result
                except CliUnavailable:
                    raise
                except (RunError, DeliveryError, ValueError, OSError) as exc:
                    attempts.append({'stage': 'resume', 'reason': _reason(exc)})
            candidates, tried, discovered_once, index = self._seeds(context, seed), set(), False, 0
            while True:
                for lead in candidates:
                    key = (lead.get('imageUrl'), lead.get('pageUrl'), lead.get('usageSourceUrl') or lead.get('pageUrl'))
                    if key in tried:
                        continue
                    tried.add(key)
                    try:
                        result = self._candidate(context, lead, directory / ('candidate-' + str(index)))
                        if result['status'] == 'VERIFIED':
                            result['attempts'] = attempts
                            write_json(directory / 'report.json', result)
                            return result
                        attempts.append({'stage': 'candidate', 'imageUrl': lead.get('imageUrl'), 'pageUrl': lead.get('pageUrl'), 'reason': 'CANDIDATE_DEFERRED'})
                    except CliUnavailable:
                        raise
                    except (RunError, DeliveryError, ValueError, OSError) as exc:
                        attempts.append({'stage': 'candidate', 'imageUrl': lead.get('imageUrl'), 'pageUrl': lead.get('pageUrl'), 'reason': _reason(exc)})
                    finally:
                        index += 1
                if discovered_once:
                    break
                # Exhaustion of seeds is not exhaustion of available sources.
                # Search alternatives once; do not repeatedly retry a bad lead.
                discovered_once = True
                documents = self.sources(identity_urls(context['target']))
                prompt = DISCOVERY_PROMPT + '\nUNTRUSTED SEARCH INPUT:\n' + json.dumps({'context': context, 'previousAttempts': attempts,
                    'previousCandidates': [{'imageUrl': image, 'pageUrl': page, 'usageSourceUrl': usage} for image, page, usage in sorted(tried)]}, ensure_ascii=False)
                discovered, _ = self._call(directory / 'discover', prompt, DISCOVERY_SCHEMA, [], documents, 'entity-media-discover-1')
                candidates = self._seeds(context, discovered['candidates'])
                if not candidates:
                    attempts.append({'stage': 'discover', 'reason': 'NO_IMAGE_FOUND'})
        except CliUnavailable as exc:
            write_json(directory / 'report.json', {'status': 'BLOCKED', 'retryable': True, 'reason': exc.reason, 'attempts': attempts})
            raise
        except (RunError, DeliveryError, ValueError, OSError) as exc:
            attempts.append({'stage': 'discover', 'reason': _reason(exc)})
        report = {'status': 'DEFERRED', 'retryable': True, 'retryAt': (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat(), 'attempts': attempts}
        write_json(directory / 'report.json', report)
        return report


def _reason(exc):
    # Never persist transport exception messages: an injected API can contain
    # headers, tokens or configuration. Our own stable error codes are safe.
    message = str(exc)
    return message if isinstance(exc, RunError) and re.fullmatch(r'[A-Z_]{3,100}', message) else type(exc).__name__


Worker = EntityMediaWorker
