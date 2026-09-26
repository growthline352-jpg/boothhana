from __future__ import annotations
import json
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

class DeliveryError(RuntimeError): pass
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl): return None

def endpoint(base: str) -> str:
    u=urlsplit(base)
    if u.username or u.password or not u.hostname or u.query or u.fragment:
        raise DeliveryError('apiBaseUrl에는 인증정보/query/fragment를 넣지 마세요.')
    if u.scheme!='https' and not (u.scheme=='http' and u.hostname in ('localhost','127.0.0.1','::1')):
        raise DeliveryError('운영 API는 HTTPS가 필요합니다. HTTP는 localhost만 허용합니다.')
    if u.path not in ('','/'):
        raise DeliveryError('apiBaseUrl은 API 경로를 제외한 origin으로 입력하세요.')
    return base.rstrip('/')+'/api/internal/subculture/batches'

def send_batch(base: str, token: str, batch: dict, timeout: int=45, attempts: int=3, sleep=time.sleep) -> dict:
    if len(token)<32: raise DeliveryError('수집 전용 토큰은 최소 32자여야 합니다.')
    body=json.dumps(batch,ensure_ascii=False,separators=(',',':')).encode()
    if len(body)>2*1024*1024: raise DeliveryError('배치가 2MiB를 초과했습니다.')
    opener=urllib.request.build_opener(NoRedirect())
    last=''
    for attempt in range(attempts):
        req=urllib.request.Request(endpoint(base),data=body,method='POST',headers={
            'Content-Type':'application/json; charset=utf-8','Authorization':'Bearer '+token,
            'User-Agent':'BoothHana-Subculture-Collector/1'})
        try:
            with opener.open(req,timeout=timeout) as response:
                raw=response.read(1024*1024+1)
                if len(raw)>1024*1024: raise DeliveryError('API 응답이 너무 큽니다.')
                value=json.loads(raw)
                if not isinstance(value,dict): raise DeliveryError('수집 API의 응답 형식이 잘못되었습니다.')
                if str(value.get('runId'))!=batch['runId']: raise DeliveryError('API 응답의 runId가 일치하지 않습니다.')
                return value
        except urllib.error.HTTPError as error:
            # Never print arbitrary server body or secrets. No redirects carrying a bearer token.
            last=f'HTTP {error.code}'
            error.close()
            if error.code not in (429,502,503,504): raise DeliveryError('수집 결과 저장 실패: '+last) from None
        except (urllib.error.URLError,TimeoutError,ConnectionError,OSError) as error:
            last=type(error).__name__
        except (ValueError,KeyError) as error:
            raise DeliveryError('수집 API가 올바른 JSON 응답을 주지 않았습니다.') from error
        if attempt+1<attempts: sleep(min(2**attempt,8))
    raise DeliveryError('전송 실패('+last+'). 동일 batch.json을 --retry-batch로 재전송하세요.')
