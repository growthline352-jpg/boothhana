package com.boothhana.support;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.*;
import java.nio.charset.StandardCharsets;
/** No auth decision here: Spring Security still authenticates and checks CSRF before controllers. */
public class SupportRequestFilter extends OncePerRequestFilter {
 @Override protected boolean shouldNotFilter(HttpServletRequest r){return !r.getRequestURI().contains("/support/");}
 @Override protected void doFilterInternal(HttpServletRequest r,HttpServletResponse s,FilterChain chain)throws ServletException,IOException {
  s.setHeader("Cache-Control","no-store");s.setHeader("Pragma","no-cache");s.setHeader("Referrer-Policy","no-referrer");s.setHeader("X-Content-Type-Options","nosniff");
  if(!java.util.Set.of("POST","PUT","PATCH").contains(r.getMethod())||r.getRequestURI().contains("/attachments/")){chain.doFilter(r,s);return;}
  final int max=128*1024;
  if(r.getContentLengthLong()>max){reject(s);return;}
  byte[] bytes=r.getInputStream().readNBytes(max+1);if(bytes.length>max){reject(s);return;}
  chain.doFilter(new HttpServletRequestWrapper(r){
   @Override public ServletInputStream getInputStream(){var in=new ByteArrayInputStream(bytes);return new ServletInputStream(){public int read(){return in.read();}public boolean isFinished(){return in.available()==0;}public boolean isReady(){return true;}public void setReadListener(ReadListener l){throw new UnsupportedOperationException("Blocking MVC only");}};}
   @Override public BufferedReader getReader(){return new BufferedReader(new InputStreamReader(getInputStream(),StandardCharsets.UTF_8));}
   @Override public int getContentLength(){return bytes.length;}@Override public long getContentLengthLong(){return bytes.length;}
  },s);
 }
 private void reject(HttpServletResponse s)throws IOException{s.setStatus(413);s.setContentType("application/json;charset=UTF-8");s.getWriter().write("{\"status\":413,\"code\":\"REQUEST_TOO_LARGE\",\"message\":\"접수 내용이 너무 큽니다.\"}");}
}
