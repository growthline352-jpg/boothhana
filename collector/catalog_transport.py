from __future__ import annotations
import json,time,urllib.request,urllib.error
from transport import endpoint,NoRedirect,DeliveryError

class Api:
    def __init__(self,base: str,token: str,timeout: int=45):
        endpoint(base)
        if len(token)<32: raise DeliveryError('BOOTH_COLLECTOR_TOKEN must be at least 32 characters')
        self.base=base.rstrip('/');self.token=token;self.timeout=timeout
        self.opener=urllib.request.build_opener(NoRedirect())
    def public_event(self,event_id):
        if type(event_id) is not int or event_id<1:raise DeliveryError('Invalid public event ID')
        request=urllib.request.Request(self.base+f'/api/public/catalog/events/{event_id}',headers={'Accept':'application/json','User-Agent':'BoothHana-ImageRepair/1'})
        # Never send the collector token to a public endpoint or image host.
        with self.opener.open(request,timeout=self.timeout) as response:
            body=response.read(10*1024*1024+1)
        if len(body)>10*1024*1024:raise DeliveryError('Public event response too large')
        return json.loads(body)
    def request(self,method,path,data=None,raw: bytes|None=None,headers=None,attempts=3):
        if not path.startswith('/api/internal/subculture/') or '\\' in path or '#' in path: raise DeliveryError('Unapproved API path')
        if raw is not None and data is not None: raise DeliveryError('Mixed request body')
        body=raw if raw is not None else (json.dumps(data if data is not None else {},ensure_ascii=False,separators=(',',':')).encode() if method!='GET' else None)
        maximum=10*1024*1024 if raw is not None else 2*1024*1024
        if body is not None and len(body)>maximum: raise DeliveryError('Request exceeds size limit')
        actual={'Authorization':'Bearer '+self.token,'User-Agent':'BoothHana-Catalog/5','Content-Type':'application/json'}
        actual.update(headers or {})
        if actual['Authorization']!='Bearer '+self.token: raise DeliveryError('Authorization override is forbidden')
        for attempt in range(attempts):
            req=urllib.request.Request(self.base+path,method=method,data=body,headers=actual)
            try:
                with self.opener.open(req,timeout=self.timeout) as response:
                    content=response.read(10*1024*1024+1)
                    if len(content)>10*1024*1024: raise DeliveryError('Response too large')
                    return json.loads(content)
            except urllib.error.HTTPError as exc:
                code=exc.code;exc.close()
                if code not in (429,502,503,504): raise DeliveryError(f'HTTP {code}; do not alter an already-delivered payload') from None
                error=f'HTTP {code}'
            except (OSError,urllib.error.URLError,TimeoutError) as exc: error=type(exc).__name__
            except ValueError as exc: raise DeliveryError('Invalid API JSON') from exc
            if attempt+1<attempts: time.sleep(min(2**attempt,8))
        raise DeliveryError('API delivery failed: '+error)
