"""Raster -> bounded image tiles -> original normalized geometry. No OCR; CLI vision reads labels."""
from __future__ import annotations
import hashlib,io,json,math
from pathlib import Path
from PIL import Image
from media_fetch import inspect_image,MediaError
from floorplan_contract import utf16_length
EXTRACTOR='cli-floorplan-v8.1'

def tiles(data:bytes,content_type:str,folder:Path,tile_size=1400,overlap=240,max_tiles=40):
    digest=inspect_image(data,content_type)
    if not 512<=tile_size<=2000 or not 64<=overlap<tile_size:raise ValueError('Tile settings')
    folder.mkdir(parents=True,exist_ok=True)
    with Image.open(io.BytesIO(data)) as image:
        if getattr(image,'n_frames',1)!=1:raise MediaError('Animated floorplans are not supported')
        # EXIF orientation is deliberately NOT applied: source image and coordinates use the same pixel raster.
        # Reject rotated JPEGs rather than rendering one orientation and extracting another.
        if image.getexif().get(274,1)!=1:raise MediaError('EXIF rotated original: review an orientation-normalized source')
        image.load();width,height=image.size
        image=image.convert('RGB')
        overview=image.copy();overview.thumbnail((1400,1400));overview.save(folder/'overview.png')
        step=tile_size-overlap
        xs=list(range(0,max(1,width-tile_size+1),step));ys=list(range(0,max(1,height-tile_size+1),step))
        xs=sorted(set(xs+[max(0,width-tile_size)]));ys=sorted(set(ys+[max(0,height-tile_size)]))
        if len(xs)*len(ys)>max_tiles:raise MediaError('Image needs more tiles than configured; increase budget or review manually')
        out=[]
        for y in ys:
            for x in xs:
                r=min(x+tile_size,width);b=min(y+tile_size,height);path=folder/f'tile-{x}-{y}.png'
                image.crop((x,y,r,b)).save(path)
                out.append({'path':path,'x':x,'y':y,'width':r-x,'height':b-y})
    return digest,width,height,folder/'overview.png',out

def bounds(points):return min(p['x'] for p in points),min(p['y'] for p in points),max(p['x'] for p in points),max(p['y'] for p in points)
def area(points):return abs(sum(a['x']*b['y']-b['x']*a['y'] for a,b in zip(points,points[1:]+points[:1])))/2

def simple(points):
    if len({(p['x'],p['y']) for p in points})!=len(points):return False
    def cross(a,b,c):return (b['x']-a['x'])*(c['y']-a['y'])-(b['y']-a['y'])*(c['x']-a['x'])
    n=len(points)
    for i in range(n):
        for j in range(i+1,n):
            if (i+1)%n==j or (j+1)%n==i:continue
            a,b,c,d=points[i],points[(i+1)%n],points[j],points[(j+1)%n]
            if cross(a,b,c)*cross(a,b,d)<=0 and cross(c,d,a)*cross(c,d,b)<=0 and all(max(min(a[k],b[k]),min(c[k],d[k]))<=min(max(a[k],b[k]),max(c[k],d[k])) for k in ('x','y')):return False
    return True

def merge_tiles(outputs:list[tuple[dict,dict]],width:int,height:int):
    shapes=[];warnings=[];complete=True
    for tile,result in outputs:
        complete=complete and result['complete']
        for warning in result['warnings']:
            if not isinstance(warning,str) or not warning.strip() or utf16_length(warning)>1000:
                complete=False;warnings.append('Invalid/overlong extraction warning omitted; review source')
            else:warnings.append(warning)
        for shape in result['shapes']:
            label=shape['label']
            if label is not None and (not isinstance(label,str) or utf16_length(label)>80):
                complete=False;warnings.append('Invalid/overlong booth label omitted; review source');continue
            points=shape['points']
            if not 3<=len(points)<=16 or any(type(p[k]) not in (int,float) or not math.isfinite(p[k]) or not 0<=p[k]<=1 for p in points for k in ('x','y')):
                complete=False;warnings.append('Invalid/out-of-range tile polygon omitted');continue
            if not shape['boundaryConfirmed']:
                complete=False;warnings.append('Clipped boundary requires confirmation');continue
            ps=[{'x':round((tile['x']+p['x']*tile['width'])/width,8),'y':round((tile['y']+p['y']*tile['height'])/height,8)} for p in points]
            if not simple(ps) or area(ps)<.0000005:complete=False;warnings.append('Zero/small polygon omitted');continue
            label=shape['label'];b=bounds(ps);duplicate=False
            for old in shapes:
                a=bounds(old['points']);intersection=max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]));union=(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-intersection
                if old['label']==label and intersection/max(union,1e-12)>.7:duplicate=True;break
            if not duplicate:
                identity=hashlib.sha256(json.dumps([label,ps],sort_keys=True).encode()).hexdigest()[:20]
                shapes.append({**shape,'id':'b-'+identity,'points':ps})
            if len(shapes)>3000:raise ValueError('Maximum 3000 floorplan regions')
    # Deduplication cannot prove exhaustive extraction. Warnings remain visible for review.
    return {'extractorVersion':EXTRACTOR,'complete':complete,'shapes':shapes,'warnings':list(dict.fromkeys(warnings))[:200]}
