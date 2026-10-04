"""Build small, offline SVG outlines from the KOGL Type 1 SGIS/KOSTAT dataset.

Source: southkorea/southkorea-maps, kostat/2018/json (collected 2018-12-24).
These simplified outlines are for area selection, not venue geocoding.
Run from any directory with Python 3; no third-party packages are required.
"""
import json
import math
import re
import urllib.request
from pathlib import Path

SOURCE = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/60c8c0cf0016381d80004d6b125760d6c5cb0605/kostat/2018/json/skorea-municipalities-2018-topo-simple.json'
data = json.load(urllib.request.urlopen(SOURCE))
scale, translate = data['transform']['scale'], data['transform']['translate']
arcs = []
for arc in data['arcs']:
    x = y = 0
    points = []
    for dx, dy in arc:
        x, y = x + dx, y + dy
        points.append([x * scale[0] + translate[0], y * scale[1] + translate[1]])
    arcs.append(points)

regions = {}
for geometry in next(iter(data['objects'].values()))['geometries']:
    props = geometry['properties']
    code = props['code']
    if not code.startswith(('11', '31')):
        continue
    province = 'SEOUL' if code.startswith('11') else 'GYEONGGI'
    name = props['name'] if province == 'SEOUL' else re.match(r'^.+?[시군]', props['name'])[0]
    region = regions.setdefault((province, name), {'id': f'{province}_{code if province == "SEOUL" else code[:4]+"0"}', 'province': province, 'name': name, 'short': name if len(name)<=2 else name[:-1], 'rings': []})
    polygons = geometry['arcs'] if geometry['type'] == 'MultiPolygon' else [geometry['arcs']]
    for polygon in polygons:
        for ring in polygon:
            points = []
            for index in ring:
                part = arcs[index] if index >= 0 else list(reversed(arcs[~index]))
                points.extend(part if not points else part[1:])
            region['rings'].append(points)

for province in ['SEOUL', 'GYEONGGI']:
    selected = [r for r in regions.values() if r['province'] == province]
    points = [p for r in selected for ring in r['rings'] for p in ring]
    cosine = math.cos(math.radians(37.5))
    xmin, xmax = min(p[0] for p in points)*cosine, max(p[0] for p in points)*cosine
    ymin, ymax = min(p[1] for p in points), max(p[1] for p in points)
    ratio = min(600/(xmax-xmin), 540/(ymax-ymin))
    offset_x, offset_y = (660-(xmax-xmin)*ratio)/2, (600-(ymax-ymin)*ratio)/2
    def project(p):
        return [round(offset_x+(p[0]*cosine-xmin)*ratio, 2), round(offset_y+(ymax-p[1])*ratio, 2)]
    for region in selected:
        # Largest component gives a useful label point even for coastal islands.
        def center(ring):
            cross = [a[0]*b[1]-b[0]*a[1] for a,b in zip(ring, ring[1:])]
            area = sum(cross)
            if abs(area) < 1e-9:
                return 0, ring[0]
            return abs(area), [sum((a[i]+b[i])*c for a,b,c in zip(ring, ring[1:],cross))/(3*area) for i in (0,1)]
        _, point = max((center(ring) for ring in region['rings']), key=lambda x:x[0])
        region['point'] = {'lat': round(point[1],6), 'lng': round(point[0],6)}
        region['label'] = project(point)
        region['path'] = ''.join('M'+'L'.join(','.join(str(v) for v in project(p)) for p in ring)+'Z' for ring in region.pop('rings'))

# Keep geographic centers unchanged. Place labels near them with short leader
# lines, bounded inside the viewport. Prefer sideways movement over latitude
# shifts so dense cities around Seoul keep their north/south relationship.
for province in ['SEOUL', 'GYEONGGI']:
    rows = [r for r in regions.values() if r['province'] == province]
    placed = []
    offsets = sorted(((x,y) for x in range(-160,161,8) for y in range(-32,33,8)), key=lambda p:p[0]**2+8*p[1]**2)
    for r in sorted(rows, key=lambda r:r['label'][1]):
        r['anchor'] = r['label'][:]
        width = len(r['short'])*14+30
        for dx,dy in offsets:
            x,y = r['anchor'][0]+dx,r['anchor'][1]+dy
            if not (width/2+12<=x<=648-width/2 and 28<=y<=572):
                continue
            if all(abs(x-other['label'][0])>=(width+len(other['short'])*14+30)/2+4 or abs(y-other['label'][1])>=34 for other in placed):
                r['label'] = [round(x,2),round(y,2)]
                break
        else:
            raise ValueError('No readable label position for '+r['name'])
        placed.append(r)

target = Path(__file__).resolve().parents[1] / 'src/features/itinerary/region-shapes.json'
target.write_text(json.dumps(list(regions.values()), ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
print(f'{len(regions)} regions written to {target}')
