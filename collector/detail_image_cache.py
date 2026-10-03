"""Keep exact verified analysis bytes for later approved storage of signed URLs.

No publication or approval here. Reads require the same page/image identity,
administrator host policy for every observed redirect, and a verified checksum.
"""
import hashlib,json,re
from pathlib import Path
from urllib.parse import urlsplit
from media_fetch import MediaError,check_url,inspect_image,MAX_BYTES
from run import write_json

def identity(page,image):return hashlib.sha256((page+'\n'+image).encode()).hexdigest()

def retain_images(observations,files,directory):
    paths={file.name:file for file in files}
    for source in observations:
        if source.get('status')!='READ':continue
        for image in source.get('images',[]):
            trace=image.get('fetchedUrls') or []
            if image.get('analysisStatus')!='ATTACHED' or not trace or not image.get('contentType'):continue
            path=paths.get(image.get('imageFile'));digest=image.get('sha256')
            if not path or path.is_symlink() or not re.fullmatch('[a-f0-9]{64}',str(digest)):raise MediaError('Invalid detail image checkpoint')
            if not 0<path.stat().st_size<=MAX_BYTES:raise MediaError('Invalid detail image size')
            raw=path.read_bytes()
            if inspect_image(raw,image['contentType'])!=digest:raise MediaError('Detail image checksum mismatch')
            if directory.is_symlink():raise MediaError('Detail image cache is a symlink')
            directory.mkdir(parents=True,exist_ok=True);directory.chmod(0o700)
            blob=directory/(digest+'.image')
            if blob.is_symlink():raise MediaError('Detail image object is a symlink')
            if not blob.exists():
                with blob.open('xb') as output:blob.chmod(0o600);output.write(raw)
            key=identity(source['sourceUrl'],image['url'])
            write_json(directory/(key+'.json'),dict(pageUrl=source['sourceUrl'],imageUrl=image['url'],sha256=digest,contentType=image['contentType'],fetchedUrls=trace))

def approved_image(asset,directory,hosts,blocked_hosts=()):
    if asset.get('rightsState')!='APPROVED':return None
    page,image=asset.get('pageUrl'),asset.get('imageUrl')
    if not isinstance(page,str) or not isinstance(image,str):return None
    if directory.is_symlink():raise MediaError('Detail image cache is a symlink')
    manifest=directory/(identity(page,image)+'.json')
    if not manifest.exists():return None
    if manifest.is_symlink() or manifest.stat().st_size>16000:raise MediaError('Invalid detail image manifest')
    value=json.loads(manifest.read_text(encoding='utf-8'))
    if value.get('pageUrl')!=page or value.get('imageUrl')!=image:raise MediaError('Detail image identity mismatch')
    trace=value.get('fetchedUrls')
    if not isinstance(trace,list) or not 1<=len(trace)<=4 or trace[0]!=image:raise MediaError('Detail image redirect provenance missing')
    for url in trace:
        _,host=check_url(url,hosts)
        if any(host==entry.removeprefix('*.') or host.endswith('.'+entry.removeprefix('*.')) for entry in blocked_hosts):raise MediaError('Cached image source is blocked')
    digest=value.get('sha256')
    if not isinstance(digest,str) or not re.fullmatch('[a-f0-9]{64}',digest):raise MediaError('Invalid cached image digest')
    blob=directory/(digest+'.image')
    if blob.is_symlink() or not blob.is_file() or not 0<blob.stat().st_size<=MAX_BYTES:raise MediaError('Invalid cached image object')
    raw=blob.read_bytes();mime=value.get('contentType')
    if inspect_image(raw,mime)!=digest:raise MediaError('Cached image checksum mismatch')
    return raw,mime,digest
