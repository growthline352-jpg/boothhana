"""Native event identity/date checks; model hints and candidate dates are not proof."""
from datetime import date, datetime, timedelta, timezone
import re
import unicodedata


def identity_label(value):
    value = unicodedata.normalize('NFKC', str(value or '')).casefold()
    value = re.sub(r'(?<![\w가-힣])(?:19|20)\d{2}(?:\s*년)?(?!\d)', '', value)
    value = re.sub(r'(?:제\s*)?\d+\s*회|\b\d+(?:st|nd|rd|th)\b', '', value)
    return re.sub(r'[^가-힣a-z0-9]', '', value)


def name_matches(expected, observed):
    target = identity_label(expected)
    if len(target) >= 4:
        return target in identity_label(observed)
    # Short Latin brands such as AGF are meaningful exact tokens; never match
    # them inside a different word (e.g. MAGFest).
    return bool(re.fullmatch(r'[a-z]{3}', target) and re.search(
        r'(?<![a-z])'+re.escape(target)+r'(?![a-z])',
        unicodedata.normalize('NFKC', str(observed or '')).casefold()))


def years(value):
    return {int(v) for v in re.findall(r'(?<!\d)((?:19|20)\d{2})(?!\d)', str(value or ''))}


def numbered_editions(value):
    return {int(a or b) for a, b in re.findall(r'(?:제\s*)?(\d+)\s*회|\b(\d+)(?:st|nd|rd|th)\b', str(value or ''), re.I)}


# Every date token must carry its year, or inherit it from the actually quoted
# event heading. Never inherit the candidate's guessed year.
DATE = re.compile(r'(?<!\d)(?:(?P<year>(?:19|20)\d{2})\s*(?:년\s*|[./-]\s*))?'
                  r'(?P<month>\d{1,2})\s*(?:월\s*|[./]\s*|-(?=\d{1,2}(?!\d)))'
                  r'(?P<day>\d{1,2})(?!\d)(?:\s*일)?')
WEEKDAY = r'(?:\((?:[월화수목금토일](?:요일)?|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\.?\))?'
SHORT_END = re.compile(r'\s*'+WEEKDAY+r'\s*'
                       r'(?:~|∼|～|〜|–|—|-(?!\d{4})|부터)\s*(?P<day>\d{1,2})(?![\d./:-])(?:\s*일)?', re.I)
RANGE = re.compile(r'^\s*'+WEEKDAY+r'\s*(?:~|∼|～|〜|–|—|-|부터|to)\s*$', re.I)
MONTHS = dict(zip(('jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'), range(1,13)))
MONTH_NAME = r'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?'
ENGLISH_DATE = re.compile(r'(?<!\w)(?P<month>'+MONTH_NAME+r')\.?\s+(?P<day>\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:,?\s+(?P<year>(?:19|20)\d{2}))?', re.I)
DAY_MONTH_DATE = re.compile(r'(?<!\w)(?P<day>\d{1,2})(?:st|nd|rd|th)?\s+(?P<month>'+MONTH_NAME+r')\.?\s+(?P<year>(?:19|20)\d{2})(?!\d)', re.I)
IGNORED_LABEL = re.compile(r'예매|예약|모집|신청|접수|판매|게시|작성|등록|수정|발행|공지일|티켓\s*오픈|booking|reservation|registration|published|updated|ticket\s*(?:sales?|open)|sales?\s*(?:period|dates?)', re.I)
EVENT_LABEL = re.compile(r'(?:행사|운영|진행|관람|전시|공연)\s*(?:개최\s*)?(?:기간|일정|일시|일자|날짜|일(?=\s|[:：]|\d|$))|개최\s*(?:기간|일정|일시|일자|날짜|일(?=\s|[:：]|\d|$))|event\s*dates?', re.I)
ISO_TIMESTAMP = re.compile(r'(?<!\d)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?(?![\d:])', re.I)


def source_datetime(value):
    parsed=datetime.fromisoformat(value.upper().replace('Z','+00:00'))
    return parsed.astimezone(timezone(timedelta(hours=9))) if parsed.tzinfo else parsed


def date_text(value):
    """Normalize valid ISO timestamps to the collection's Seoul calendar date."""
    text = unicodedata.normalize('NFKC', str(value or ''))
    def replace(match):
        try:
            parsed=source_datetime(match[0])
        except ValueError:
            return 'INVALID_TIMESTAMP'
        return parsed.date().isoformat()
    return ISO_TIMESTAMP.sub(replace, text)


def date_matches(text):
    return sorted([*DATE.finditer(text), *ENGLISH_DATE.finditer(text), *DAY_MONTH_DATE.finditer(text)], key=lambda m:m.start())


def source_date_ranges(quote, source, heading=''):
    """Bind a quote to dates in its actual source field, including the label.

    A model may crop a booking/publication label from a real excerpt. Check its
    actual source positions as well as the complete published intervals; neither
    a cropped range nor a date from a neighboring field can support an event.
    """
    native, excerpt = date_text(source), date_text(quote)
    supported = date_ranges(excerpt, heading) & date_ranges(native, heading)
    if not supported:
        return set()
    compact = lambda value: re.sub(r'\s+', '', value).casefold()
    text, needle = compact(native), compact(excerpt)
    if not needle:
        return set()
    offsets = [len(compact(excerpt[:match.start()])) for match in date_matches(excerpt)]
    at = text.find(needle)
    while at >= 0:
        if offsets and all(_event_context(text, at + offset) for offset in offsets):
            return supported
        at = text.find(needle, at + 1)
    return set()


def _event_context(text, offset):
    # Field meaning does not expire after 120 characters of explanation. Use
    # the nearest native label until a later event/booking field replaces it.
    before = text[:offset]
    ignored = list(IGNORED_LABEL.finditer(before))
    event = list(EVENT_LABEL.finditer(before))
    return not ignored or bool(event and event[-1].start() > ignored[-1].start())


def date_ranges(quote, heading=''):
    """Read explicit numeric/Korean dates and ranges, including shortened ends.

    A year in the quoted event heading may qualify month/day-only dates. Mixed
    years without an explicit date year stay ambiguous. Booking/publication
    dates are excluded using their closest field label.
    """
    text = date_text(quote)
    anchor_years = years(text) or years(heading)
    inherited = next(iter(anchor_years)) if len(anchor_years) == 1 else None
    tokens = []
    matches = date_matches(text)
    for match in matches:
        year = int(match['year']) if match['year'] else inherited
        if year is None:
            continue
        try:
            month = int(match['month']) if match['month'].isdigit() else MONTHS[match['month'][:3].casefold()]
            value = date(year, month, int(match['day']))
        except ValueError:
            continue
        if match['year']:
            inherited = year
        tokens.append(dict(value=value, start=match.start(), end=match.end(), explicitYear=bool(match['year']),
                           eligible=_event_context(text, match.start())))
    pairs, points = set(), set()
    used = set()
    for index, token in enumerate(tokens):
        if not token['eligible']:
            continue
        if index + 1 < len(tokens):
            other = tokens[index + 1]
            if other['eligible'] and RANGE.fullmatch(text[token['end']:other['start']]):
                end = other['value']
                # An abbreviated December -> January range crosses a year.
                # Only infer this when the actual range has no explicit end year.
                if end < token['value'] and not other['explicitYear'] and token['value'].month == 12 and end.month == 1:
                    end = end.replace(year=token['value'].year + 1)
                if token['value'] <= end:
                    pairs.add((token['value'], end)); used.update((index, index + 1))
                continue
        short = SHORT_END.match(text, token['end'])
        if short:
            try:
                end = token['value'].replace(day=int(short['day']))
                if token['value'] <= end:
                    pairs.add((token['value'], end)); used.add(index)
            except ValueError:
                pass
    for index, token in enumerate(tokens):
        if token['eligible'] and index not in used:
            points.add(token['value']); pairs.add((token['value'], token['value']))
    # Adjacent explicitly listed single days also support a contiguous range;
    # never merge dates across a closed day or crop a published range.
    ordered = sorted(points)
    if ordered:
        start = end = ordered[0]
        for item in ordered[1:]:
            if item == end + timedelta(days=1):
                end = item
            else:
                pairs.add((start, end)); start = end = item
        pairs.add((start, end))
    return pairs
