const feed={basis:'POS_LOGGED_UNITS',windowDays:30,from:'2026-08-18T00:00:00Z',to:'2026-09-17T00:00:00Z',asOf:'2026-09-17T00:00:00Z',items:[]};
const names=['달토끼 아크릴 키링','작은 고양이 스티커 팩','별의 우편 엽서 세트','여름 고양이 파우치','구름 손거울','밤산책 캔배지','하루의 마스킹테이프','몽글 노트'];
feed.items=names.map((name,i)=>({rank:i+1,productId:i+1,eventProductId:101+i,name,price:[8500,3500,6000,15000,8000,4000,5500,6500][i],imageUrl:null,boothName:['달토끼공방','고양이서재','별빛 문방구','작은 여름'][i%4],eventName:'[가상] 창작 굿즈 마켓',eventState:i===4?'ENDED':'PUBLISHED',soldOut:i===5}));
module.exports={feed};
