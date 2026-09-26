/** Explicit test double: ordered requests, atomic copy-on-write, abort, cursor, version upgrade.
 * NOT a browser IndexedDB implementation. No disk/quota/durability/browser conformance claims. */
export function memoryIDB() {
 const factory={version:0,stores:new Map(),queue:[],busy:false,delayNextOpen:null}
 const clone=v=>v===undefined?undefined:structuredClone(v)
 class Tx {
  constructor(names,mode){this.names=names;this.mode=mode;this.ops=[];this.stores=null;this.error=null;this.aborted=false;factory.queue.push(this);pump()}
  objectStore(name){
   if(!this.names.includes(name))throw Error('Unknown store')
   const tx=this,req=(fn,reuse)=>{const r=reuse||{};tx.ops.push(()=>{r.result=clone(fn());r.onsuccess?.({target:r})});return r}
   return {
    get:key=>req(()=>tx.stores.get(name).get(key)),
    getAll:()=>req(()=>[...tx.stores.get(name).values()]),
    put:(value,key)=>req(()=>{const k=key??value.id;tx.stores.get(name).set(k,clone(value));return k}),
    delete:key=>req(()=>tx.stores.get(name).delete(key)),
    clear:()=>req(()=>tx.stores.get(name).clear()),
    openCursor:()=>{
     const r={};let keys=null,index=0
     function step(){tx.ops.push(()=>{
      keys??=[...tx.stores.get(name).keys()];const key=keys[index++]
      r.result=key===undefined?null:{value:clone(tx.stores.get(name).get(key)),delete:()=>tx.objectStore(name).delete(key),continue:step}
      r.onsuccess?.({target:r})
     })}
     step();return r
    }
   }
  }
  abort(){this.aborted=true}
 }
 function pump(){if(factory.busy||!factory.queue.length)return;factory.busy=true;const tx=factory.queue[0]
  tx.stores=new Map([...factory.stores].map(([k,v])=>[k,new Map([...v].map(([id,x])=>[id,clone(x)]))]))
  function tick(){setImmediate(()=>{
   if(tx.aborted){finish(false);return}
   const op=tx.ops.shift()
   if(op){try{op()}catch(e){tx.error=e;tx.onerror?.({target:tx});tx.aborted=true}tick();return}
   finish(true)
  })}
  function finish(ok){if(ok&&tx.mode!=='readonly')factory.stores=tx.stores;factory.queue.shift();factory.busy=false
   if(ok)tx.oncomplete?.({target:tx});else tx.onabort?.({target:tx});pump()
  }
  tick()
 }
 factory.open=(_name,version)=>{
  const r={},delay=factory.delayNextOpen;factory.delayNextOpen=null
  Promise.resolve(delay).then(()=>setImmediate(()=>{
   if(version<factory.version){r.error=new DOMException('Old database version','VersionError');r.onerror?.({target:r});return}
   const db={close(){},objectStoreNames:{contains:name=>factory.stores.has(name)},
    createObjectStore(name){factory.stores.set(name,new Map())},transaction:(names,mode)=>new Tx(names,mode)}
   r.result=db
   if(version>factory.version){r.transaction={objectStore:name=>({clear:()=>factory.stores.get(name).clear()})};r.onupgradeneeded?.({oldVersion:factory.version,newVersion:version});factory.version=version}
   r.onsuccess?.({target:r})
  }));return r
 }
 return factory
}
export function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
