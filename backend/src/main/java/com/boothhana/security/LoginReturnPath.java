package com.boothhana.security;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
/** Only same-frontend application routes; never an arbitrary redirect. */
public final class LoginReturnPath {
 private LoginReturnPath(){}
 public static String safe(String value){
  if(value==null||value.length()>2000)return "/";
  String check=value;
  for(int i=0;i<3;i++){
   if(!check.startsWith("/")||check.startsWith("//")||check.contains("\\")||check.codePoints().anyMatch(c->c<32||c==127))return "/";
   try{String next=URLDecoder.decode(check,StandardCharsets.UTF_8);if(next.equals(check))break;check=next;}catch(IllegalArgumentException e){return "/";}
  }
  try{URI u=URI.create(value);String p=u.getPath();if(u.isAbsolute()||u.getRawAuthority()!=null||p==null||p.contains(".."))return "/";
   if(!p.matches("/(?:|account|onboarding|discover(?:/[^/]+)?|events(?:/[^/]+)?|booths/[^/]+(?:/reserve)?|products/[^/]+|reservations(?:/[^/]+)?|library(?:/[A-Za-z0-9_/-]+)?|support(?:/[A-Za-z0-9_/-]+)?|creator(?:/[A-Za-z0-9_/-]+)?|admin(?:/[A-Za-z0-9_/-]+)?)"))return "/";
   return value;
  }catch(RuntimeException e){return "/";}
 }
}
