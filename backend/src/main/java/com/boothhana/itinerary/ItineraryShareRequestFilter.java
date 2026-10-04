package com.boothhana.itinerary;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Bound anonymous JSON uploads before Jackson allocates a full document, including chunked bodies. */
@Component
public class ItineraryShareRequestFilter extends OncePerRequestFilter {
 private static final int LIMIT=80000;
 @Override protected boolean shouldNotFilter(HttpServletRequest request){return !"POST".equals(request.getMethod())||!request.getRequestURI().matches("/api/public/itinerary/shares(?:/[0-9a-fA-F-]{36}/revoke)?");}
 @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException{
  if(request.getContentLengthLong()>LIMIT){reject(response);return;}
  byte[] bytes=request.getInputStream().readNBytes(LIMIT+1);if(bytes.length>LIMIT){reject(response);return;}
  chain.doFilter(new HttpServletRequestWrapper(request){
   @Override public ServletInputStream getInputStream(){var stream=new ByteArrayInputStream(bytes);return new ServletInputStream(){
    @Override public int read(){return stream.read();}
    @Override public int read(byte[] target,int offset,int count){return stream.read(target,offset,count);}
    @Override public boolean isFinished(){return stream.available()==0;}
    @Override public boolean isReady(){return true;}
    @Override public void setReadListener(ReadListener listener){throw new IllegalStateException("Synchronous JSON input only");}
   };}
   @Override public BufferedReader getReader(){return new BufferedReader(new InputStreamReader(getInputStream(),StandardCharsets.UTF_8));}
  },response);
 }
 private static void reject(HttpServletResponse response)throws IOException{response.setStatus(413);response.setContentType("application/json");response.setCharacterEncoding("UTF-8");response.setHeader("Cache-Control","no-store");response.getWriter().write("{\"status\":413,\"code\":\"SHARE_TOO_LARGE\",\"message\":\"공유할 일정 내용이 너무 커요. 메모를 줄인 뒤 다시 시도해 주세요.\"}");}
}
