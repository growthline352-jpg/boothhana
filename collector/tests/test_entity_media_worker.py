import copy
import hashlib
import io
import json
import tempfile
import unittest
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import jsonschema
from PIL import Image

from entity_media_worker import (DISCOVERY_SCHEMA, EXTRACTION_SCHEMA, REVIEW_SCHEMA, EntityMediaWorker,
                                 NativeImages, NativeSources, identity_urls)
from graph_worker import MODEL, configuration
from run import CliUnavailable, RunError
from transport import DeliveryError

PAGE = 'https://official.example/character'
USAGE = 'https://official.example/image-license'
IDENTITY = 'https://publisher.example/work/character'
IMAGE = 'https://cdn.example/character.png'
PUBLIC = 'https://storage.example/verified/character.png'
TARGET = str(uuid.uuid4())
CONTEXT = {'kind': 'SUBJECT', 'targetId': TARGET, 'targetHash': 'a' * 64,
           'target': {'id': TARGET, 'kind': 'CHARACTER', 'name': '캐릭터', 'workName': '작품', 'sourceUrl': IDENTITY},
           'existingMedia': []}
SEED = {'kind': 'SUBJECT', 'targetId': TARGET, 'imageUrl': IMAGE, 'pageUrl': PAGE,
        'usageSourceUrl': USAGE, 'usageStatus': 'PERMITTED'}


def png(color='red'):
    stream = io.BytesIO()
    Image.new('RGB', (8, 8), color).save(stream, format='PNG')
    return stream.getvalue()


RAW = png()
DIGEST = hashlib.sha256(RAW).hexdigest()


def document(url, digest=None):
    return {'url': url, 'available': True, 'sha256': digest or hashlib.sha256(url.encode()).hexdigest(),
            'capturedAt': '2026-10-09T00:00:00Z', 'title': 'Official original', 'text': 'Actual original body',
            'truncated': False, 'nativeImages': [{'imageUrl': IMAGE, 'role': 'CONTENT', 'alt': '캐릭터'}]}


def extracted(usage='PERMITTED'):
    return {'status': 'CANDIDATE', 'reason': '확인', 'candidate': {
        'caption': '작품의 캐릭터', 'credit': 'Creator / CC BY 4.0',
        'identityEvidence': '원문 양쪽에 작품과 캐릭터가 일치함', 'usageStatus': usage,
        'usageEvidence': '이 이미지에 적용되는 명시적 CC BY 4.0 조건', 'usageSourceUrl': USAGE,
        'identitySourceEvidence': '공식 출판사 원문에서 캐릭터 이름과 소속 작품 일치', 'sourceIsOfficial': True,
    }}


class FakeApi:
    def __init__(self):
        self.calls, self.saved = [], None

    def request(self, method, path, body=None, **kwargs):
        self.calls.append((method, path, copy.deepcopy(body), copy.deepcopy(kwargs)))
        if path.endswith('/candidates'):
            self.saved = {'id': str(uuid.uuid4()), 'kind': body['kind'], 'targetId': body['targetId'],
                          'targetHash': body['targetHash'], 'active': True, 'candidate': copy.deepcopy(body['candidate']),
                          'extractionId': body['extractionId'], 'resultHash': 'b' * 64, 'revision': 0,
                          'imageUrl': body['candidate']['imageUrl'], 'imageHash': body['candidate']['imageHash'],
                          'usageStatus': body['candidate']['usageStatus'], 'extractionAudit': copy.deepcopy(body['audit']),
                          'reviewVerdict': None, 'rightsState': 'PENDING', 'storageState': 'PENDING', 'storedUrl': None}
        elif path.endswith('/review'):
            self.saved.update(reviewVerdict=body['verdict'], reviewAudit=body['audit'], revision=self.saved['revision'] + 1,
                              rightsState='APPROVED' if body['verdict'] == 'APPROVE' else 'PENDING')
        elif path.endswith('/content'):
            self.saved.update(storageState='STORED', revision=self.saved['revision'] + 1, storedUrl=PUBLIC)
        elif path.endswith('/failure'):
            self.saved.update(storageState='FAILED', revision=self.saved['revision'] + 1)
        return copy.deepcopy(self.saved)


class EntityMediaWorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cfg = configuration()
        self.cfg['stateDirectory'] = self.temp.name
        self.api = FakeApi()
        self.model_calls, self.source_calls, self.image_calls = [], [], []
        self.usage, self.verdict = 'PERMITTED', 'APPROVE'

    def sources(self, urls):
        self.source_calls.append(list(urls))
        return [document(url) for url in urls]

    def images(self, url, hosts, **kwargs):
        self.image_calls.append((url, hosts, kwargs))
        self.assertTrue(kwargs['url_guard'](url))
        return RAW, 'image/png', DIGEST

    def search(self, cfg, directory, prompt, schema_path, **kwargs):
        self.assertEqual(MODEL, cfg['model'])
        self.assertTrue(kwargs['web_search'])
        self.model_calls.append((directory.name, prompt, kwargs['images']))
        if directory.name == 'discover':
            value = {'status': 'DEFERRED', 'candidates': [], 'reason': '원문 없음'}
        else:
            self.assertEqual(1, len(kwargs['images']))
            self.assertEqual(RAW, kwargs['images'][0].read_bytes())
            value = extracted(self.usage) if directory.name.startswith('extract') else {'verdict': self.verdict, 'reason': '독립 원문 검토'}
        return json.dumps(value, ensure_ascii=False).encode(), True, {'input_tokens': 10}

    def worker(self, **overrides):
        return EntityMediaWorker(self.cfg, self.api, search=overrides.get('search', self.search),
                                 source_loader=overrides.get('source_loader', self.sources),
                                 image_fetcher=overrides.get('image_fetcher', self.images))

    def test_two_fresh_attached_calls_required_before_exact_byte_publication(self):
        result = self.worker().run_target(CONTEXT, [SEED])
        self.assertEqual('VERIFIED', result['status'])
        self.assertFalse(result['retryable'])
        self.assertEqual(['extract-1', 'review'], [c[0] for c in self.model_calls])
        self.assertEqual(['/candidates', '/review', '/content'], ['/' + c[1].rsplit('/', 1)[-1] for c in self.api.calls])
        extract, review, upload = self.api.calls
        self.assertNotEqual(extract[2]['audit']['promptVersion'], review[2]['audit']['promptVersion'])
        for call in (extract, review):
            audit = call[2]['audit']
            self.assertEqual([DIGEST], audit['imageHashes'])
            self.assertEqual({PAGE, USAGE, IDENTITY}, {d['url'] for d in audit['sourceDocuments']})
            self.assertTrue({PAGE, USAGE, IDENTITY} <= set(audit['openedUrls']))
        self.assertEqual(RAW, upload[3]['raw'])
        self.assertEqual(DIGEST, upload[3]['headers']['X-Image-SHA256'])
        self.assertEqual(str(len(RAW)), upload[3]['headers']['X-Image-Size'])
        self.assertEqual([IMAGE, IMAGE, PUBLIC], [c[0] for c in self.image_calls])
        self.assertTrue(any(len(urls) == 3 for urls in self.source_calls))

    def test_untrusted_seed_permission_cannot_overrule_unknown_model_result(self):
        self.usage = 'UNKNOWN'
        result = self.worker().run_target(CONTEXT, [SEED])
        self.assertEqual('DEFERRED', result['status'])
        self.assertTrue(result['retryable'])
        self.assertEqual('ENRICH', self.api.saved['reviewVerdict'])
        self.assertFalse(any(c[1].endswith('/content') for c in self.api.calls))
        self.assertEqual('REVIEW_ENRICH', result['attempts'][0]['reason'])

    def test_explicit_forbidden_always_rejects_without_upload(self):
        self.usage = 'FORBIDDEN'
        result = self.worker().run_target(CONTEXT, SEED)
        self.assertEqual('DEFERRED', result['status'])
        self.assertEqual('REJECT', self.api.saved['reviewVerdict'])
        self.assertFalse(any(c[1].endswith('/content') for c in self.api.calls))

    def test_guessed_image_not_in_original_never_reaches_model_or_api(self):
        def sources(urls):
            return [{**document(url), 'nativeImages': []} for url in urls]
        result = self.worker(source_loader=sources).run_target(CONTEXT, [SEED])
        self.assertEqual('IMAGE_NOT_IN_ORIGINAL_PAGE', result['attempts'][0]['reason'])
        self.assertEqual(['discover'], [c[0] for c in self.model_calls])
        self.assertEqual([], self.image_calls)
        self.assertEqual([], self.api.calls)

    def test_fresh_image_change_requires_reextraction_not_approval(self):
        count = []
        def images(url, hosts, **kwargs):
            count.append(url)
            raw = RAW if len(count) == 1 else png('blue')
            return raw, 'image/png', hashlib.sha256(raw).hexdigest()
        result = self.worker(image_fetcher=images).run_target(CONTEXT, [SEED])
        self.assertEqual('IMAGE_CHANGED_REEXTRACT', result['attempts'][0]['reason'])
        self.assertEqual(['extract-1', 'discover'], [c[0] for c in self.model_calls])
        self.assertFalse(any(c[1].endswith('/review') or c[1].endswith('/content') for c in self.api.calls))

    def test_fresh_original_change_requires_reextraction(self):
        def sources(urls):
            return [document(url, 'd' * 64 if len(urls) == 3 and url == USAGE else None) for url in urls]
        result = self.worker(source_loader=sources).run_target(CONTEXT, [SEED])
        self.assertEqual('SOURCE_CHANGED_REEXTRACT', result['attempts'][0]['reason'])
        self.assertEqual(['extract-1', 'discover'], [c[0] for c in self.model_calls])
        self.assertFalse(any(c[1].endswith('/review') for c in self.api.calls))

    def test_creator_identity_original_is_mandatory_even_if_name_and_image_match(self):
        def sources(urls):
            return [document(url) if url != IDENTITY else {'url': url, 'available': False} for url in urls]
        creator = {**CONTEXT, 'kind': 'CREATOR', 'targetId': '1', 'target': {**CONTEXT['target'], 'id': 1}}
        result = self.worker(source_loader=sources).run_target(creator, [{**SEED, 'kind': 'CREATOR', 'targetId': '1'}])
        self.assertEqual('IDENTITY_SOURCE_UNAVAILABLE', result['attempts'][0]['reason'])
        self.assertEqual([], self.api.calls)

    def test_unknown_official_reference_needs_two_calls_and_never_uploads_bytes(self):
        self.usage, self.verdict = 'UNKNOWN', 'REFERENCE'
        result = self.worker().run_target(CONTEXT, [SEED])
        self.assertEqual('VERIFIED', result['status'])
        self.assertEqual('SOURCE_REFERENCE', result['displayMode'])
        self.assertEqual(IMAGE, result['publicUrl'])
        self.assertEqual(['extract-1', 'review'], [c[0] for c in self.model_calls])
        self.assertEqual('UNKNOWN', self.api.saved['usageStatus'])
        self.assertEqual('PENDING', self.api.saved['rightsState'])
        self.assertEqual('PENDING', self.api.saved['storageState'])
        self.assertFalse(any(c[1].endswith('/content') for c in self.api.calls))

    def test_available_official_alternate_does_not_fabricate_blocked_canonical_audits(self):
        self.usage, self.verdict = 'UNKNOWN', 'REFERENCE'
        def sources(urls):
            return [document(url) if url != IDENTITY else {'url': url, 'available': False} for url in urls]
        result = self.worker(source_loader=sources).run_target(CONTEXT, [SEED])
        self.assertEqual('VERIFIED', result['status'])
        self.assertEqual(PAGE, self.api.saved['candidate']['identitySourceUrl'])
        for call in self.api.calls:
            self.assertNotIn(IDENTITY, [d['url'] for d in call[2]['audit']['sourceDocuments']])

    def test_changed_html_reference_is_independently_reviewed_with_truthful_hashes(self):
        self.usage, self.verdict = 'UNKNOWN', 'REFERENCE'
        def sources(urls):
            return [document(url, 'd' * 64 if len(urls) == 3 and url == PAGE else None) for url in urls]
        result = self.worker(source_loader=sources).run_target(CONTEXT, [SEED])
        self.assertEqual('VERIFIED', result['status'])
        before = self.api.saved['extractionAudit']['sourceDocuments']
        after = self.api.saved['reviewAudit']['sourceDocuments']
        self.assertNotEqual(next(d['sha256'] for d in before if d['url'] == PAGE), next(d['sha256'] for d in after if d['url'] == PAGE))
        self.assertEqual([DIGEST], self.api.saved['reviewAudit']['imageHashes'])

    def test_unknown_creator_and_unofficial_subject_cannot_be_referenced(self):
        self.usage, self.verdict = 'UNKNOWN', 'REFERENCE'
        creator = {**CONTEXT, 'kind': 'CREATOR', 'targetId': '1', 'target': {**CONTEXT['target'], 'id': 1}}
        result = self.worker().run_target(creator, [{**SEED, 'kind': 'CREATOR', 'targetId': '1'}])
        self.assertEqual('DEFERRED', result['status'])
        self.assertEqual('ENRICH', self.api.saved['reviewVerdict'])
        def search(cfg, directory, prompt, schema_path, **kwargs):
            value = extracted('UNKNOWN') if directory.name.startswith('extract') else {'verdict': 'REFERENCE', 'reason': '확인'}
            if directory.name.startswith('extract'):
                value['candidate']['sourceIsOfficial'] = False
            if directory.name == 'discover':
                value = {'status': 'DEFERRED', 'candidates': [], 'reason': '원문 없음'}
            return json.dumps(value).encode(), True, {}
        self.api = FakeApi()
        result = self.worker(search=search).run_target(CONTEXT, [SEED])
        self.assertEqual('DEFERRED', result['status'])
        self.assertEqual('ENRICH', self.api.saved['reviewVerdict'])

    def test_shared_quota_failure_propagates_and_does_not_drain_candidates(self):
        def search(*args, **kwargs):
            raise CliUnavailable('USAGE_LIMIT')
        with self.assertRaises(CliUnavailable):
            self.worker(search=search).run_target(CONTEXT, [SEED, {**SEED, 'imageUrl': IMAGE + '?next'}])
        self.assertEqual([], self.api.calls)
        report = json.loads(next(Path(self.temp.name).rglob('report.json')).read_text())
        self.assertEqual('BLOCKED', report['status'])
        self.assertEqual('USAGE_LIMIT', report['reason'])

    def test_no_image_found_stays_retryable(self):
        result = self.worker().run_target(CONTEXT)
        self.assertEqual('DEFERRED', result['status'])
        self.assertEqual('NO_IMAGE_FOUND', result['attempts'][0]['reason'])
        self.assertTrue(result['retryable'])
        self.assertIn('retryAt', result)

    def test_null_and_fallback_models_rejected(self):
        for model in (None, 'auto', 'gpt-5.6-sol'):
            with self.subTest(model=model), self.assertRaises(RunError):
                EntityMediaWorker({**self.cfg, 'model': model}, self.api)
        self.assertNotIn('maxCliCalls', self.cfg)
        self.assertNotIn('maxCost', self.cfg)

    def test_empty_filtered_page_still_advances_pagination(self):
        responses = [{'items': [], 'afterId': '100', 'hasMore': True},
                     {'items': [{**CONTEXT, 'kind': 'CREATOR', 'targetId': '101'}], 'afterId': '101', 'hasMore': False}]
        calls = []
        def request(method, path, body=None, **kwargs):
            calls.append(parse_qs(urlsplit(path).query, keep_blank_values=True))
            return responses.pop(0)
        self.api.request = request
        items = list(self.worker().targets('CREATOR'))
        self.assertEqual('101', items[0]['targetId'])
        self.assertEqual(['', '100'], [p['afterId'][0] for p in calls])

    def test_nonadvancing_cursor_cannot_loop_forever(self):
        self.api.request = lambda *a, **k: {'items': [], 'afterId': '', 'hasMore': True}
        with self.assertRaisesRegex(RunError, 'cursor'):
            list(self.worker().targets('SUBJECT'))

    def test_approved_failed_upload_resumes_without_model_using_reviewed_sha(self):
        self.worker().run_target(CONTEXT, [SEED])
        self.api.saved.update(storageState='FAILED', storedUrl=None)
        saved = copy.deepcopy(self.api.saved)
        self.api.calls, self.model_calls = [], []
        result = self.worker().run_target({**CONTEXT, 'existingMedia': [saved]})
        self.assertEqual('VERIFIED', result['status'])
        self.assertEqual([], self.model_calls)
        self.assertTrue(any(c[1].endswith('/content') for c in self.api.calls))
        upload = next(c for c in self.api.calls if c[1].endswith('/content'))
        self.assertEqual(str(saved['revision']), upload[3]['headers']['X-Asset-Revision'])

    def test_stored_metadata_is_insufficient_without_public_byte_match(self):
        def images(url, hosts, **kwargs):
            raw = png('blue') if url == PUBLIC else RAW
            return raw, 'image/png', hashlib.sha256(raw).hexdigest()
        result = self.worker(image_fetcher=images).run_target(CONTEXT, [SEED])
        self.assertEqual('DEFERRED', result['status'])
        self.assertEqual('PUBLIC_IMAGE_HASH_MISMATCH', result['attempts'][0]['reason'])

    def test_failed_upload_cannot_resume_after_license_original_changes(self):
        self.worker().run_target(CONTEXT, [SEED])
        self.api.saved.update(storageState='FAILED', storedUrl=None)
        saved = copy.deepcopy(self.api.saved)
        self.api.calls, self.model_calls = [], []
        def sources(urls):
            return [document(url, 'd' * 64 if url == USAGE else None) for url in urls]
        result = self.worker(source_loader=sources).run_target({**CONTEXT, 'existingMedia': [saved]})
        self.assertEqual('DEFERRED', result['status'])
        self.assertEqual('SOURCE_CHANGED_REEXTRACT', result['attempts'][0]['reason'])
        self.assertFalse(any(c[1].endswith('/content') for c in self.api.calls))

    def test_delivery_failure_records_safe_reason_and_remains_retryable(self):
        original = self.api.request
        def request(method, path, body=None, **kwargs):
            if path.endswith('/content'):
                raise DeliveryError('secret headers must never be copied')
            return original(method, path, body, **kwargs)
        self.api.request = request
        result = self.worker().run_target(CONTEXT, [SEED])
        self.assertEqual('STORAGE_DEFERRED', result['attempts'][0]['reason'])
        self.assertEqual('FAILED', self.api.saved['storageState'])
        self.assertNotIn('secret', json.dumps(result))

    def test_official_subject_seed_format_normalizes_without_cross_entity_leak(self):
        worker = self.worker()
        seeds = [{'subjectId': TARGET, 'kind': 'CHARACTER', 'imageUrl': IMAGE, 'pageUrl': PAGE},
                 {'subjectId': str(uuid.uuid4()), 'kind': 'CHARACTER', 'imageUrl': IMAGE, 'pageUrl': PAGE}]
        self.assertEqual(1, len(worker._seeds(CONTEXT, {'candidates': seeds})))

    def test_new_license_url_is_fetched_before_second_extraction_and_review(self):
        new_license = 'https://official.example/new-license'
        def search(cfg, directory, prompt, schema_path, **kwargs):
            self.model_calls.append(directory.name)
            value = extracted() if directory.name.startswith('extract') else {'verdict': 'APPROVE', 'reason': '조건 확인'}
            if directory.name.startswith('extract'):
                value['candidate']['usageSourceUrl'] = new_license
            return json.dumps(value).encode(), True, {}
        result = self.worker(search=search).run_target(CONTEXT, [SEED])
        self.assertEqual('VERIFIED', result['status'])
        self.assertEqual(['extract-1', 'extract-2', 'review'], self.model_calls)
        self.assertTrue(any(new_license in urls for urls in self.source_calls))
        extraction = self.api.calls[0][2]
        self.assertIn(new_license, [d['url'] for d in extraction['audit']['sourceDocuments']])

    def test_fetcher_claimed_sha_cannot_replace_verified_actual_bytes(self):
        result = self.worker(image_fetcher=lambda *a, **k: (RAW, 'image/png', 'f' * 64)).run_target(CONTEXT, [SEED])
        self.assertEqual('FETCH_IMAGE_HASH_MISMATCH', result['attempts'][0]['reason'])
        self.assertEqual(['discover'], [c[0] for c in self.model_calls])
        self.assertEqual([], self.api.calls)

    def test_rejected_or_unknown_first_candidate_does_not_skip_correct_second(self):
        alternate = IMAGE + '?actual-option'
        for first_usage, first_verdict in [('PERMITTED', 'REJECT'), ('UNKNOWN', 'APPROVE')]:
            with self.subTest(first_usage=first_usage):
                self.api, self.model_calls, self.image_calls = FakeApi(), [], []
                def sources(urls):
                    return [{**document(url), 'nativeImages': [{'imageUrl': IMAGE}, {'imageUrl': alternate}]} for url in urls]
                def search(cfg, directory, prompt, schema_path, **kwargs):
                    self.model_calls.append(directory.name)
                    is_first = 'candidate-0' in str(directory)
                    value = extracted(first_usage if is_first else 'PERMITTED') if directory.name.startswith('extract') else {'verdict': first_verdict if is_first else 'APPROVE', 'reason': '해당 옵션 독립 검토'}
                    return json.dumps(value).encode(), True, {}
                result = self.worker(search=search, source_loader=sources).run_target(CONTEXT, [SEED, {**SEED, 'imageUrl': alternate}])
                self.assertEqual('VERIFIED', result['status'])
                self.assertEqual(['extract-1', 'review', 'extract-1', 'review'], self.model_calls)
                self.assertEqual(1, len(result['attempts']))
                self.assertEqual(1, sum(c[1].endswith('/content') for c in self.api.calls))
                self.assertEqual(alternate, self.api.saved['imageUrl'])

    def test_seed_exhaustion_searches_new_alternative_once(self):
        alternate = IMAGE + '?new-provider'
        def sources(urls):
            return [{**document(url), 'nativeImages': [{'imageUrl': alternate}]} for url in urls]
        def search(cfg, directory, prompt, schema_path, **kwargs):
            if directory.name == 'discover':
                self.model_calls.append(('discover', prompt, []))
                return json.dumps({'status': 'FOUND', 'candidates': [{**{k: SEED[k] for k in ('pageUrl', 'usageSourceUrl')},
                            'imageUrl': alternate, 'reason': '다른 공식 자료'}], 'reason': '후보 발견'}).encode(), True, {}
            return self.search(cfg, directory, prompt, schema_path, **kwargs)
        result = self.worker(search=search, source_loader=sources).run_target(CONTEXT, [SEED])
        self.assertEqual('VERIFIED', result['status'])
        self.assertEqual(['discover', 'extract-1', 'review'], [c[0] for c in self.model_calls])
        self.assertEqual('IMAGE_NOT_IN_ORIGINAL_PAGE', result['attempts'][0]['reason'])
        self.assertEqual(alternate, self.api.saved['imageUrl'])

    def test_discovery_does_not_retry_identical_failed_seed_in_same_session(self):
        def sources(urls):
            return [{**document(url), 'nativeImages': []} for url in urls]
        def search(cfg, directory, prompt, schema_path, **kwargs):
            self.model_calls.append(directory.name)
            return json.dumps({'status': 'FOUND', 'candidates': [{**{k: SEED[k] for k in ('imageUrl', 'pageUrl', 'usageSourceUrl')},
                         'reason': '중복 후보'}], 'reason': '발견'}).encode(), True, {}
        result = self.worker(search=search, source_loader=sources).run_target(CONTEXT, [SEED])
        self.assertEqual('DEFERRED', result['status'])
        self.assertEqual(['discover'], self.model_calls)
        self.assertEqual(1, len(result['attempts']))
        self.assertEqual([], self.api.calls)

    def test_schemas_are_strict_and_valid(self):
        for schema in (DISCOVERY_SCHEMA, EXTRACTION_SCHEMA, REVIEW_SCHEMA):
            jsonschema.Draft202012Validator.check_schema(schema)
            self.assertFalse(schema['additionalProperties'])


class NativeEvidenceTests(unittest.TestCase):
    def test_empty_boolean_image_attributes_do_not_break_original_source_capture(self):
        parser = NativeImages(PAGE)
        parser.feed('<img src="/character.png" srcset data-srcset alt><meta name content><script type></script>')
        self.assertEqual([{'imageUrl': 'https://official.example/character.png', 'role': 'CONTENT', 'alt': ''}], parser.images)

    def test_native_html_css_and_jsonld_references_only(self):
        parser = NativeImages(PAGE)
        parser.feed('''<img src="/small.png" srcset="/large.png 2x" alt="character">
          <meta property="og:image" content="https://cdn.example/social.png">
          <style>.character {background:url('/background.webp')}</style>
          <script type="application/ld+json">{"image":{"contentUrl":"https://cdn.example/structured.jpg"}}</script>
          <script>const guessed='https://cdn.example/not-native.png';</script>''')
        images = {item['imageUrl'] for item in parser.images}
        self.assertEqual({urljoin for urljoin in ('https://official.example/small.png', 'https://official.example/large.png',
                                                 'https://cdn.example/social.png', 'https://official.example/background.webp',
                                                 'https://cdn.example/structured.jpg')}, images)
        self.assertNotIn('https://cdn.example/not-native.png', images)

    def test_source_hash_is_real_original_not_transformed_text(self):
        body = '<title>공식 원문</title><p>' + '실제 공개 원문 텍스트 ' * 30 + '</p><img src="' + IMAGE + '">'
        digest = hashlib.sha256(body.encode()).hexdigest()
        def fetch(url, hosts, **kwargs):
            value = 'User-agent: *\nAllow: /' if url.endswith('/robots.txt') else body
            return value, hashlib.sha256(value.encode()).hexdigest()
        docs = NativeSources([], fetch=fetch)([PAGE])
        self.assertTrue(docs[0]['available'])
        self.assertEqual(digest, docs[0]['sha256'])
        self.assertEqual(IMAGE, docs[0]['nativeImages'][0]['imageUrl'])

    def test_commons_specific_file_api_records_actual_json_native_url(self):
        api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Cextmetadata&titles=File%3ATest.svg'
        payload = {'query': {'pages': {'1': {'title': 'File:Test.svg', 'imageinfo': [{'thumburl': IMAGE,
                        'extmetadata': {'LicenseShortName': {'value': 'CC BY 4.0'}, 'Artist': {'value': 'Actual author'}}}]}}}}
        body = json.dumps(payload)
        calls = []
        def fetch(url, hosts, **kwargs):
            calls.append((url, kwargs))
            value = 'User-agent: *\nAllow: /' if url.endswith('/robots.txt') else body
            return value, hashlib.sha256(value.encode()).hexdigest()
        doc = NativeSources([], fetch=fetch)([api])[0]
        self.assertTrue(doc['available'])
        self.assertEqual(hashlib.sha256(body.encode()).hexdigest(), doc['sha256'])
        self.assertEqual(IMAGE, doc['nativeImages'][0]['imageUrl'])
        self.assertTrue(next(kwargs for url, kwargs in calls if url == api)['allow_json'])

    def test_identity_provenance_walk_ignores_image_leads(self):
        target = {'profile': {'profileUrl': IDENTITY}, 'provenance': [{'officialLinks': [PAGE], 'sources': [{'url': USAGE}]}],
                  'images': [{'pageUrl': 'https://fake.example/', 'url': IMAGE}]}
        self.assertEqual([IDENTITY, PAGE, USAGE], identity_urls(target))


if __name__ == '__main__':
    unittest.main()
