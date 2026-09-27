/* Scope is /offline/ ONLY. Never intercept/cache /api, auth, creator, admin or account HTML. */
// Storage schema stays v19/DB2; v24 validates managed map byte hashes.
const CACHE='boothhana-offline-shell-v24-2'
const FILES=['/offline/index.html','/offline/app.mjs','/offline/store.mjs','/offline/policy.mjs','/offline/style.css','/offline/manifest.webmanifest','/offline/icon.svg']
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE)
 // Reject missing/redirected shell files instead of reporting a working offline reader.
 for(const url of FILES){const response=await fetch(new Request(url,{cache:'reload',credentials:'omit',redirect:'error'}));if(!response.ok)throw Error('Offline shell missing: '+url);
  const type=(response.headers.get('content-type')||'').toLowerCase();
  const valid=url.endsWith('.mjs')?/(java|ecma)script/.test(type):url.endsWith('.css')?type.includes('text/css'):url.endsWith('.html')?type.includes('text/html'):url.endsWith('.svg')?type.includes('image/svg+xml'):type.includes('json');
  if(!valid)throw Error('Offline shell content type mismatch: '+url);
  if(url.endsWith('.html')&&!(await response.clone().text()).includes('src="/offline/app.mjs"'))throw Error('Offline reader was replaced by a hosting fallback');
  await cache.put(url,response)}
 await self.skipWaiting()
})()))
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith('boothhana-offline-shell-')&&name!==CACHE)await caches.delete(name)
 await self.clients.claim()
})()))
self.addEventListener('message',event=>{
 if(event.data?.type==='OFFLINE_PING')event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);let ready=true
  for(const file of FILES)if(!await cache.match(file))ready=false
  event.ports[0]?.postMessage({ready,version:19})
 })())
})
self.addEventListener('fetch',event=>{
 const request=event.request,u=new URL(request.url)
 if(request.method!=='GET'||u.origin!==self.location.origin)return
 const path=u.pathname==='/offline/'?'/offline/index.html':u.pathname
 if(!FILES.includes(path))return
 event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(path)||fetch(request)})())
})
