"""Keep public roster card boundaries; never read hydration or account data."""
import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

class RosterCards(HTMLParser):
    def __init__(self, url):
        super().__init__()
        self.url = url
        self.entry_pattern = re.compile(re.escape('https://dongne.co' + urlsplit(url).path) + r'/[1-9][0-9]*')
        self.frames, self.rows, self.card = [], [], None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        hidden = bool(self.frames and self.frames[-1]['hidden']) or tag in ('script', 'style', 'noscript', 'template') or 'hidden' in attrs or attrs.get('aria-hidden') == 'true'
        frame = {'tag': tag, 'hidden': hidden}
        if not hidden and tag == 'div' and 'neu-card' in attrs.get('class', '').split():
            if self.card is not None:
                self.card['invalid'] = True
            else:
                self.card = {'anchors': [], 'chips': [], 'authors': [], 'text': [], 'invalid': False}
                frame['cardRoot'] = True
        if self.card is not None and not hidden:
            if tag == 'a' and 'stretched-link' in attrs.get('class', '').split() and any(f['tag'] == 'h3' for f in self.frames):
                href = urljoin(self.url, attrs.get('href', ''))
                if self.entry_pattern.fullmatch(href):
                    frame['anchor'] = {'url': href, 'text': []}
                    self.card['anchors'].append(frame['anchor'])
            if 'data-chip' in attrs:
                frame['chip'] = []
                self.card['chips'].append(frame['chip'])
            if tag == 'p' and {'truncate', 'text-xs', 'text-muted-foreground'} <= set(attrs.get('class', '').split()):
                frame['author'] = []
                self.card['authors'].append(frame['author'])
        if tag not in VOID:
            self.frames.append(frame)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        index = next((i for i in range(len(self.frames) - 1, -1, -1) if self.frames[i]['tag'] == tag), None)
        if index is None:
            return
        closing = self.frames[index:]
        if self.card is not None and index != len(self.frames) - 1:
            self.card['invalid'] = True
        del self.frames[index:]
        if self.card is not None and any(f.get('cardRoot') for f in closing):
            card, self.card = self.card, None
            if card['invalid'] or len(card['anchors']) != 1:
                return
            anchor = card['anchors'][0]
            name = ' '.join(anchor['text'])
            text = '\n'.join(card['text'])
            if name and len(text) <= 16000:
                row = {'sourceEntryId': anchor['url'].rsplit('/', 1)[1], 'detailUrl': anchor['url'],
                       'registrationName': name, 'text': text,
                       'tagLabels': [' '.join(chip) for chip in card['chips'] if chip]}
                if len(card['authors']) == 1 and card['authors'][0]:
                    displayed = ' '.join(card['authors'][0])
                    label = re.sub(r'\s*·\s*[0-9]+(?:\.[0-9]+)?부스\s*$', '', displayed)
                    parts = [part.strip() for part in label.split(',')]
                    # Literal display parts, not canonical people or account ownership.
                    # Ambiguous layout/size text remains available in the original card.
                    if '·' not in label and len(displayed) <= 2000 and 1 <= len(parts) <= 30 and all(0 < len(part) <= 255 for part in parts):
                        row.update(authorText=displayed, authorNameParts=parts)
                self.rows.append(row)

    def handle_data(self, data):
        if self.card is None or not data.strip() or self.frames and self.frames[-1]['hidden']:
            return
        text = ' '.join(data.split())
        self.card['text'].append(text)
        for frame in self.frames:
            if 'anchor' in frame:
                frame['anchor']['text'].append(text)
            if 'chip' in frame:
                frame['chip'].append(text)
            if 'author' in frame:
                frame['author'].append(text)

def dongne_roster_entries(url, html, pagination):
    if not pagination:
        return []
    parser = RosterCards(url)
    parser.feed(html)
    parser.close()
    # A partial/ambiguous mapping would recreate the adjacent-card error.
    # Publish structure only when every validated current-page URL is matched.
    return parser.rows if parser.card is None and [r['detailUrl'] for r in parser.rows] == pagination['entryUrls'] else []
