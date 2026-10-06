"""Native original-page checks for every event banner entering collector batches.

Model booleans and open-audit records cannot establish image/event association.
Rejected leads remain in the local report; independent image repair reads the
preserved official event sources and owns later discovery/storage/publication.
"""
from __future__ import annotations
from copy import deepcopy
from datetime import datetime
from http.client import HTTPException
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
import unicodedata
import uuid

from event_detail_sources import allowed_by_robots, collect_detail_sources, tmm_product_url
from event_identity import name_matches
from media_fetch import check_url, fetch_html
from official_poster_sources import parse_official_document, IMAGE_CONTEXT_POLICY
from official_site_sources import site_detail_url

POLICY = 'event-batch-native-banners-v3'
OFFICIAL_KINDS = {'OFFICIAL', 'VENUE', 'ORGANIZER_SOCIAL'}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':')).encode()).hexdigest()


def _allowed(url, blocked_hosts):
    try:
        host = (urlsplit(url or '').hostname or '').rstrip('.').casefold()
        blocked = [value.removeprefix('*.') for value in blocked_hosts]
        if any(host == value or host.endswith('.' + value) for value in blocked):
            return False
        check_url(url, [host])
        return True
    except (ValueError, TypeError):
        return False


def _metadata_only(*args, **kwargs):
    # Association is checked before approval; image repair owns byte retrieval.
    raise ValueError('Banner validation reads original-page metadata only')


def _page_key(url):
    return tmm_product_url(url) or site_detail_url(url) or url


def _current_image_context(document):
    # Old detail checkpoints did not preserve containing headings or duplicate
    # image labels. Re-read their original before this stronger gate can trust it.
    return (document.get('sourceType') not in ('OFFICIAL_POSTER_PAGE', 'GOOGLE_SITES')
            or document.get('imageContextPolicy') == IMAGE_CONTEXT_POLICY)


def _native_event_names(event):
    name = event.get('name') or ''
    names = [name]
    # Official department-store parsers append a display venue to the source
    # title. Remove that suffix only when it is the same venue (with optional
    # following floor/room text), rather than treating any title prefix as an alias.
    if ' · ' in name:
        core, suffix = name.rsplit(' · ', 1)
        normalize = lambda value: re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', str(value or ''))).strip().casefold()
        place, venue = normalize(suffix), normalize(event.get('venueName'))
        if len(place) >= 4 and (venue == place or venue.startswith(place + ' ') or venue.startswith(place + '(')):
            names.append(core)
    return names


def validate_event_banners(events, cfg, folder, *, source_documents=(), allow_fetch=True, check_budget=None):
    """Preserve event facts and retain only natively associated original images."""
    # Lazy import avoids weekly -> image_repair -> weekly initialization cycles.
    from image_repair import poster_evidence
    from run import SEOUL

    blocked = cfg.get('blockedSourceHosts', [])
    timeout = min(15, cfg.get('httpTimeoutSeconds', 15))
    checked_on = datetime.now(SEOUL).date().isoformat()
    robots = {}
    output, observations = [], []
    for event_index, original in enumerate(events):
        event = deepcopy(original)
        banners = []
        official = {_page_key(row.get('url')) for row in event.get('sources') or []
                    if row.get('kind') in OFFICIAL_KINDS and row.get('access') == 'ORIGINAL'}
        documents = {_page_key(row['sourceUrl']): row for row in source_documents
                     if row.get('sourceUrl') and row.get('status') == 'READ' and 'images' in row and _current_image_context(row)}
        associated = set(official)
        # Specialized native readers follow official landing-page notices. The
        # link's provenance comes from fetched metadata, never a model lead.
        for _ in range(len(documents)):
            for source in list(associated):
                document = documents.get(source) or {}
                associated.update(_page_key(url) for url in [*document.get('childUrls', []), *document.get('officialUrls', [])])
        attempted = set()
        for banner in event.get('banners') or []:
            image_url, page = banner.get('imageUrl'), banner.get('pageUrl')
            page_key = _page_key(page)
            observation = dict(eventIndex=event_index, eventName=event.get('name'),
                               imageUrl=image_url, pageUrl=page, state='UNVERIFIED_ORIGINAL')
            observations.append(observation)
            if page_key not in associated:
                observation['state'] = 'NO_OFFICIAL_ORIGINAL_SOURCE'
                continue
            if not _allowed(page, blocked) or not _allowed(image_url, blocked):
                observation['state'] = 'SOURCE_POLICY_DENIED'
                continue
            if page_key not in documents and page_key not in attempted and allow_fetch:
                attempted.add(page_key)
                if check_budget:
                    check_budget()
                try:
                    if tmm_product_url(page) or site_detail_url(page):
                        detail_event = {**event, 'sources': [row for row in event['sources'] if row['url'] == page], 'discoveryLinks': []}
                        details, _ = collect_detail_sources(detail_event, Path(folder) / POLICY / str(event_index) / digest(page)[:20],
                                                            blocked, timeout, image_fetcher=_metadata_only)
                        for row in details:
                            if row.get('status') == 'READ' and _current_image_context(row):
                                documents[_page_key(row['sourceUrl'])] = row
                    else:
                        host = urlsplit(page).hostname
                        if allowed_by_robots(page, [host], timeout, robots):
                            html, _ = fetch_html(page, [host], timeout)
                            documents[page_key] = {**parse_official_document(html, page, checked_on, event.get('name')), 'status': 'READ'}
                except (ValueError, OSError, TypeError, KeyError, HTTPException):
                    # A failed source never discards the independently verified event facts.
                    pass
            document = documents.get(page_key)
            if not document:
                observation['state'] = 'ORIGINAL_NOT_READ'
                continue
            observation['nativeSource'] = {key: document.get(key) for key in
                                           ('title', 'sourceType', 'sourceScope', 'imageContextPolicy', 'bodySha256', 'checkedOn')}
            if document.get('textTruncated') or document.get('imagesTruncated'):
                observation['state'] = 'ORIGINAL_INCOMPLETE'
                continue
            native_images = [row for row in document.get('images') or [] if row.get('url') == image_url and row.get('analysisStatus') != 'PLACEHOLDER']
            if not native_images:
                observation['state'] = 'IMAGE_NOT_IN_ORIGINAL'
                continue
            # A supplied EVENT_SECTION may have been parsed for another event.
            observation['nativeImages'] = [{key: row.get(key) for key in ('url', 'role', 'nearbyText', 'nativeLabels', 'eventContext', 'sectionHeadings')} for row in native_images]
            verified = False
            for native_name in _native_event_names(event):
                section_matches = document.get('sourceScope') != 'EVENT_SECTION' or name_matches(native_name, document.get('title'))
                if section_matches and any(poster_evidence(row, document, native_name, [image_url], {**event, 'name': native_name})
                                           for row in native_images):
                    verified = True
                    observation['matchedName'] = native_name
                    break
            if not verified:
                observation['state'] = 'EVENT_OR_EDITION_MISMATCH'
                continue
            observation['state'] = 'VERIFIED_ORIGINAL'
            banners.append({**banner, 'matchesEdition': True})
        event['banners'] = banners
        output.append(event)
    return output, observations


def guard_batch_banners(batch, cfg, folder, *, source_documents=(), allow_fetch=True, check_budget=None):
    """Gate once before persisting immutable request bytes, including old replays.

    Changing an old unverified payload gets a deterministic new request ID. A
    gate-completed response-loss replay keeps its exact stored request bytes.
    """
    from run import write_json

    folder = Path(folder)
    policy = [POLICY, cfg.get('blockedSourceHosts', [])]
    before_digest = digest(batch)
    report_file = folder / 'banner-validation.json'
    if report_file.is_file():
        previous = json.loads(report_file.read_text(encoding='utf-8'))
        if previous.get('policy') == policy and previous.get('payloadDigest') == before_digest:
            return batch, previous
    gated = deepcopy(batch)
    events = gated.get('result', {}).get('events', [])
    if not events or not any(event.get('banners') for event in events):
        return gated, dict(policy=policy, originalRunId=batch.get('runId'), runId=batch.get('runId'),
                           originalDigest=before_digest, payloadDigest=before_digest, observations=[], rejected=0, verified=0)
    verified, observations = validate_event_banners(events, cfg, folder / 'banner-sources',
                                                   source_documents=source_documents, allow_fetch=allow_fetch, check_budget=check_budget)
    gated['result']['events'] = verified
    if gated != batch:
        gated['runId'] = str(uuid.uuid5(uuid.NAMESPACE_URL, POLICY + ':' + str(batch['runId']) + ':' + digest(gated['result'])))
    report = dict(policy=policy, originalRunId=batch['runId'], runId=gated['runId'],
                  originalDigest=before_digest, payloadDigest=digest(gated), observations=observations,
                  rejected=sum(row['state'] != 'VERIFIED_ORIGINAL' for row in observations),
                  verified=sum(row['state'] == 'VERIFIED_ORIGINAL' for row in observations),
                  followUp='INDEPENDENT_IMAGE_REPAIR')
    folder.mkdir(parents=True, exist_ok=True)
    report['originalPayload'] = 'banner-input-' + before_digest[:20] + '.json'
    write_json(folder / report['originalPayload'], batch)
    write_json(report_file, report)
    return gated, report
