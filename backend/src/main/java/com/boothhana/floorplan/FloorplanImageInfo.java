package com.boothhana.floorplan;
/** Read dimensions without decoding untrusted pixels; byte signatures are separately checked by ImageUploadRules. */
public final class FloorplanImageInfo {
 private FloorplanImageInfo() {}
 static int u(byte[] b,int i){if(i<0||i>=b.length)throw new IllegalArgumentException("잘린 이미지");return b[i]&255;}
 static int be16(byte[] b,int i){return u(b,i)*256+u(b,i+1);} static int le24(byte[] b,int i){return u(b,i)+256*u(b,i+1)+65536*u(b,i+2);}
 public static int[] size(byte[] b,String type) {
  if(b==null||b.length<16)throw new IllegalArgumentException("잘린 이미지");
  int w=0,h=0;
  if("image/png".equals(type)){w=be16(b,16)*65536+be16(b,18);h=be16(b,20)*65536+be16(b,22);}
  else if("image/gif".equals(type)){w=u(b,6)+256*u(b,7);h=u(b,8)+256*u(b,9);}
  else if("image/webp".equals(type)){
   String kind=new String(b,12,4,java.nio.charset.StandardCharsets.US_ASCII);
   if(kind.equals("VP8X")){if((u(b,20)&2)!=0)throw new IllegalArgumentException("애니메이션 배치도 불가");w=le24(b,24)+1;h=le24(b,27)+1;}
   else if(kind.equals("VP8L")){int x=u(b,21)|u(b,22)<<8|u(b,23)<<16|u(b,24)<<24;w=(x&0x3fff)+1;h=((x>>>14)&0x3fff)+1;}
   else if(kind.equals("VP8 ")){w=(u(b,26)+256*u(b,27))&0x3fff;h=(u(b,28)+256*u(b,29))&0x3fff;}
  } else if("image/jpeg".equals(type)){
   int p=2;while(p+4<b.length){if(u(b,p++)!=255)throw new IllegalArgumentException("JPEG segment 오류");int marker=u(b,p++);while(marker==255)marker=u(b,p++);if(marker==217||marker==218)break;if(marker==1||marker>=208&&marker<=215)continue;int len=be16(b,p);if(len<2||p+len>b.length)throw new IllegalArgumentException("JPEG 길이 오류");if(marker>=192&&marker<=207&&marker!=196&&marker!=200&&marker!=204){h=be16(b,p+3);w=be16(b,p+5);break;}p+=len;}
  }
  if(w<=0||h<=0||(long)w*h>25_000_000||w>30000||h>30000)throw new IllegalArgumentException("이미지 크기/형식 확인 필요");return new int[]{w,h};
 }
}
