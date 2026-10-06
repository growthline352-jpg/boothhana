"""Durable traversal of public schedule pages and individual event links."""
from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.parse import urljoin, urlsplit, urlunsplit, parse_qs, urlencode
from catalog_rules import allowed_source
from event_detail_sources import allowed_by_robots
from media_fetch import fetch_html
from state_files import replace_with_retry
from rules import parse_date


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.links, self.texts, self.heading = [], [], []
        self.detail_heading, self.detail_tag = [], None
        self.ld_json, self.in_ld = [], False
        self.in_footer, self.footer_addresses = False, []
        self.ignored, self.in_heading, self.anchor = 0, False, None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag in ('script', 'style', 'footer', 'noscript'):
            self.ignored += 1
        if tag == 'script' and values.get('type') == 'application/ld+json': self.in_ld = True
        if tag == 'footer': self.in_footer = True
        if self.ignored:
            return
        if tag == 'h1':
            self.in_heading = True
        if tag == 'h2' and values.get('class') in ('SingleTitle', 'title') and not self.detail_heading:
            self.detail_tag = tag
        if tag == 'a':
            self.anchor = dict(attrs=values, text=[])

    def handle_endtag(self, tag):
        if tag == 'script': self.in_ld = False
        if tag == 'footer': self.in_footer = False
        if tag in ('script', 'style', 'footer', 'noscript') and self.ignored:
            self.ignored -= 1
        if self.ignored:
            return
        if tag == 'h1':
            self.in_heading = False
        if tag == self.detail_tag: self.detail_tag = None
        if tag == 'a' and self.anchor:
            self.anchor['text'] = ' '.join(self.anchor['text']).strip()
            self.links.append(self.anchor)
            self.anchor = None

    def handle_data(self, text):
        if self.in_footer and re.search(r'(?:서울(?:특별시|시)?|경기(?:도)?)\s+.+(?:로|길)\s*\d', text):
            self.footer_addresses.append(text.strip())
        if self.in_ld:
            try:
                data = json.loads(text)
                self.ld_json.extend(data if isinstance(data, list) else [data])
            except ValueError: pass
        if self.ignored or not text.strip():
            return
        self.texts.append(text.strip())
        if self.in_heading:
            self.heading.append(text.strip())
        if self.detail_tag: self.detail_heading.append(text.strip())
        if self.anchor:
            self.anchor['text'].append(text.strip())

    @property
    def text(self):
        # Structured public venue facts are often absent from visible ticket
        # text. Keep only venue name/address; never copy contacts or raw JSON.
        facts = []
        def location(row):
            if not isinstance(row, dict): return
            types = row.get('@type') or []
            types = [types] if isinstance(types, str) else types
            if any(t in ('Event','MusicEvent','Festival','ExhibitionEvent') for t in types):
                # Retain source-declared identity and dates alongside location;
                # model-generated name/date quotes must match native material.
                name, start, end = row.get('name'), row.get('startDate'), row.get('endDate')
                if isinstance(name,str) and name.strip():
                    facts.append('공식 행사명: '+name)
                if isinstance(start,str) and isinstance(end,str):
                    facts.append('행사 개최일 '+start+' ~ '+end)
                location(row.get('location'))
            if any(t in ('Place','PerformingArtsTheater','CivicStructure','EventVenue') for t in types):
                address = row.get('address') or {}
                if isinstance(address, dict):
                    fields = [address.get(k) for k in ('addressRegion','addressLocality','streetAddress')]
                    fields = list(dict.fromkeys(v for v in fields if isinstance(v,str) and v.strip()))
                    if fields: facts.append('공식 장소 정보: '+str(row.get('name') or '')+' / '+' '.join(fields))
            for child in row.get('@graph') or []: location(child)
        for row in self.ld_json: location(row)
        return '\n'.join([*self.texts,*facts,*['사이트 하단 주소: '+address for address in self.footer_addresses]])


def canonical(url):
    value = urlsplit(url)
    return urlunsplit((value.scheme, value.netloc, value.path, value.query, ''))


def scoped_url(url, spec, scope):
    if spec.get('adapter') != 'COEX':
        return canonical(url)
    value = urlsplit(url)
    if '/exhibitions/' in value.path:
        return urlunsplit((value.scheme, value.netloc, value.path, '', ''))
    if value.path.rstrip('/') == '/event/full-schedules':
        page = (parse_qs(value.query).get('var_page') or ['1'])[0]
        if not page.isdigit() or int(page) < 1:
            raise ValueError('Invalid official calendar page')
        query = dict(var_page=page, search_start_date=scope['startDate'].replace('-', '.'),
                     search_end_date=scope['endDate'].replace('-', '.'), list_type='LIST')
        return urlunsplit((value.scheme, value.netloc, value.path, urlencode(query), ''))
    return canonical(url)


def listing_dates(text):
    pattern = r'(\d{4}[.-]\d{2}[.-]\d{2})\s*(?:~|-|–|—)\s*(\d{4}[.-]\d{2}[.-]\d{2})'
    match = re.search(pattern, text)
    if not match: return []
    try:
        start,end = [parse_date(value.replace('.', '-')) for value in match.groups()]
        return [dict(startDate=start.isoformat(),endDate=end.isoformat())] if start<=end else []
    except ValueError: return []


def links_from(html, url, spec, scope=None):
    page = Page(html)
    pages, details = [], []
    for link in page.links:
        href = link['attrs'].get('href', '')
        if not href or href.startswith(('#', 'javascript:', 'mailto:')):
            continue
        target = scoped_url(urljoin(url, href), spec, scope or {})
        parsed = urlsplit(target)
        if parsed.hostname != urlsplit(spec['url']).hostname or parsed.scheme != 'https':
            continue
        if re.search(spec['detailPattern'], target):
            details.append(dict(url=target, name=link['text'][:255]))
        elif target != canonical(url) and re.search(spec['listPattern'], target):
            pages.append(target)
    # A JS-only pagination control is not silently considered the last page.
    js_pages = bool(re.search(r'(?:goPage|fnPage|fn_page|pageMove|pageIndex)\s*\(', html))
    unique = {}
    for row in details:
        if row['url'] not in unique or row['name']:
            unique[row['url']] = row
    return list(dict.fromkeys(pages)), unique, page, js_pages


def listing_fingerprint(html, url, spec, scope):
    pages,entries,_,js_only = links_from(html,url,spec,scope)
    return sha256(json.dumps([sorted(pages),entries,js_only],sort_keys=True,ensure_ascii=False).encode()).hexdigest()


class ScheduleInventory:
    def __init__(self, path, blocked=(), fetch=None, max_seconds=120):
        self.path = Path(path)
        self.blocked, self.fetch = list(blocked), fetch
        self.deadline = time.monotonic() + max_seconds
        self.robots = {}
        self.value = json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {'version': 1, 'sources': {}}
        if self.value.get('version') != 1:
            raise ValueError('Schedule inventory version mismatch')

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps(self.value, ensure_ascii=False), encoding='utf-8')
        replace_with_retry(temporary, self.path)

    def read(self, url):
        allowed_source(url, self.blocked)
        if time.monotonic() >= self.deadline:
            raise TimeoutError('Schedule time budget; unvisited links retained')
        if self.fetch:
            return self.fetch(url)
        hosts = [urlsplit(url).hostname]
        if not allowed_by_robots(url, hosts, 15, self.robots):
            raise ValueError('Official schedule robots denied')
        html, _ = fetch_html(url, hosts, 20)
        return html

    def scan(self, spec, scope):
        key = sha256(json.dumps(spec, sort_keys=True).encode()).hexdigest()
        if key not in self.value['sources']:
            # Adopt unfinished legacy snapshots rather than lose their cursor.
            old=next(((k,r) for k,r in self.value['sources'].items() if r.get('url')==spec['url'] and r.get('state')=='PARTIAL'),None)
            if old is not None:
                self.value['sources'][key]=old[1];self.value['sources'].pop(old[0])
        source = self.value['sources'].get(key)
        if source and spec.get('adapter')=='COEX' and 'listingScope' not in source:
            old_url=next(iter(source.get('pages',{})),None) or next(iter(source.get('pagesPending',[])),None)
            params=parse_qs(urlsplit(old_url or '').query)
            if params.get('search_start_date') and params.get('search_end_date'):
                source['listingScope']={**scope,'startDate':params['search_start_date'][0].replace('.','-'),'endDate':params['search_end_date'][0].replace('.','-')}
        active_scope=source.get('listingScope',scope) if source and source.get('state')!='COMPLETE' and spec.get('adapter')=='COEX' else scope
        seed = scoped_url(spec['url'], spec, active_scope)
        if source is None:
            source=dict(url=spec['url'], pagesPending=[seed], pages={}, entries={}, documents={}, issues=[])
            self.value['sources'][key]=source
        elif source.get('state')=='COMPLETE' and source.get('seed',seed)!=seed:
            source.update(pagesPending=[seed],pages={},entries={},documents={},paginationIssues=[])
        source.update(listingScope=dict(active_scope),seed=seed)
        scope=active_scope
        # Re-read the first listing on every pass. A changed snapshot invalidates
        # cursors; a completed snapshot refreshes daily, including detail changes.
        first_html = None
        if seed in source['pages']:
            try:
                first_html = self.read(seed)
                changed = listing_fingerprint(first_html,seed,spec,scope) != source['pages'][seed]
                checked = source.get('completedAt') or ''
                daily_refresh = source.get('state') == 'COMPLETE' and checked[:10] != datetime.now(timezone.utc).date().isoformat()
                if changed or daily_refresh or source.get('parserVersion') != 3:
                    source['previousSnapshot'] = {url:{'name':row['name'],'status':row['status']} for url,row in source['entries'].items()}
                    source.update(pagesPending=[seed], pages={}, entries={}, documents={}, paginationIssues=[])
            except Exception as error:
                source.update(state='PARTIAL', issues=['FIRST_PAGE_RECHECK_FAILED:'+type(error).__name__])
                self.save()
                return source
        source['issues'] = list(source.get('paginationIssues') or [])
        # Failed links remain distinct from read links and are retried next pass.
        for url, row in source['entries'].items():
            if row.get('status') == 'INACCESSIBLE':
                row['status'] = 'PENDING'
        attempted = set()
        while source['pagesPending'] and time.monotonic() < self.deadline:
            url = source['pagesPending'][0]
            if url in attempted:
                break
            attempted.add(url)
            try:
                html = first_html if url == seed and first_html is not None else self.read(url)
                pages, entries, page, js_only = links_from(html, url, spec, scope)
                if not entries and not pages and not source['entries']:
                    raise ValueError('No recognized individual event links; source adapter required')
                source['pages'][url] = listing_fingerprint(html,url,spec,scope)
                for target in pages:
                    if target not in source['pages'] and target not in source['pagesPending']:
                        source['pagesPending'].append(target)
                for target, entry in entries.items():
                    dates = listing_dates(entry['name'])
                    source['entries'].setdefault(target, {**entry, 'status': 'PENDING', 'occurrences': dates})
                if js_only and not pages:
                    issue = 'UNRESOLVED_JS_PAGINATION:' + url
                    if issue not in source['issues']: source['issues'].append(issue)
                    if issue not in source.setdefault('paginationIssues', []): source['paginationIssues'].append(issue)
                source['pagesPending'].pop(0)
            except Exception as error:
                source['issues'].append(type(error).__name__ + ':' + str(error)[:200])
                break
            finally:
                self.save()
        # Finish the exposed list before reading each detail. No per-page or
        # per-detail count cut-off: only bounded HTTP/runtime, with checkpoints.
        if not source['pagesPending']:
            for url, entry in source['entries'].items():
                if entry['status'] == 'READ':
                    continue
                if time.monotonic() >= self.deadline:
                    break
                try:
                    page = Page(self.read(url))
                    body = page.text
                    if not body.strip():
                        raise ValueError('Empty event detail document')
                    title = ' '.join(page.detail_heading or page.heading).strip() or entry['name']
                    source['documents'][url] = dict(sourceUrl=url, title=title[:255], status='READ', bodyText=body[:60000],
                        textTruncated=len(body)>60000, footerAddresses=page.footer_addresses)
                    entry.update(name=title[:255], status='READ')
                except Exception as error:
                    entry.update(status='INACCESSIBLE', issue=type(error).__name__ + ':' + str(error)[:200])
                self.save()
        pending = sum(row['status'] != 'READ' for row in source['entries'].values())
        source['state'] = 'COMPLETE' if not source['pagesPending'] and not pending and not source['issues'] else 'PARTIAL'
        source['checkedAt'] = datetime.now(timezone.utc).isoformat()
        source['parserVersion'] = 3
        if source['state'] == 'COMPLETE': source['completedAt'] = source['checkedAt']
        self.save()
        return source


def read_fact_documents(urls, documents, blocked, fetch=None):
    reader = ScheduleInventory.__new__(ScheduleInventory)
    reader.blocked, reader.fetch, reader.deadline, reader.robots = blocked, fetch, time.monotonic() + 90, {}
    for url in urls:
        if (documents.get(url) or {}).get('status') == 'READ':
            continue
        try:
            allowed_source(url, blocked)
            if time.monotonic() >= reader.deadline:
                raise TimeoutError('Fact read time budget; candidate retained for follow-up')
            # TMM publishes the anonymous product body through a public API.
            from event_detail_sources import tmm_product_url, fetch_document, API_HOSTS, parse_tmm_product
            if tmm_product_url(url) and fetch is None:
                if not allowed_by_robots(url, ['takemm.com'], 15, reader.robots):
                    raise ValueError('TMM page robots denied')
                api_url = 'https://api.takemm.com/prod/view?last_selection_id=' + tmm_product_url(url).rsplit('/',1)[-1]
                allowed_source(api_url, blocked)
                if not allowed_by_robots(api_url, API_HOSTS, 15, reader.robots):
                    raise ValueError('TMM API robots denied')
                raw = fetch_document(api_url, API_HOSTS, 20)
                item = parse_tmm_product(raw, url, datetime.now(timezone.utc).date().isoformat())
                documents[url] = {**item, 'status': 'READ'}
            else:
                page = Page(reader.read(url));text = page.text
                if not text.strip(): raise ValueError('Empty fact document')
                documents[url] = dict(sourceUrl=url, status='READ', bodyText=text[:60000], textTruncated=len(text)>60000, footerAddresses=page.footer_addresses)
        except Exception as error:
            documents[url] = dict(sourceUrl=url, status='INACCESSIBLE', issue=type(error).__name__)
    return documents
