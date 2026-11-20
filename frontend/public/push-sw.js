self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 event.waitUntil(self.registration.showNotification('부스하나 관심 소식',{body:'새로 확인된 소식이 있어요.',tag:typeof data.tag==='string'?data.tag:'boothhana-news',data:{url:'/account/notifications'},icon:'/assets/categories/subculture-3d.webp'}))
})
self.addEventListener('notificationclick',event=>{
 event.notification.close()
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  const url=new URL('/account/notifications',self.location.origin).href
  for(const client of clients)if(new URL(client.url).origin===self.location.origin){await client.navigate(url);return client.focus()}
  return self.clients.openWindow(url)
 }))
})
