package com.boothhana.collection;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;

/** This filter is installed only on the stateless collection chain; never registered globally. */
final class CollectorTokenFilter extends OncePerRequestFilter {
    private static final int MAX_BODY=2*1024*1024;
    private final String token;
    CollectorTokenFilter(String token) { this.token=token==null?null:token.strip(); }
    static boolean matches(String configured,String supplied) {
        if(configured==null||configured.length()<32||supplied==null||supplied.length()>1024) return false;
        try {
            MessageDigest digest=MessageDigest.getInstance("SHA-256");
            return MessageDigest.isEqual(digest.digest(configured.getBytes(StandardCharsets.UTF_8)),digest.digest(supplied.getBytes(StandardCharsets.UTF_8)));
        } catch(NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        String path=request.getServletPath();
        if(!path.startsWith("/api/internal/subculture/")) { chain.doFilter(request,response);return; }
        boolean imageBody="POST".equals(request.getMethod()) && (path.matches("/api/internal/subculture/v4/assets/[0-9]+/content") || path.matches("/api/internal/subculture/v4/floorplans/versions/[0-9a-fA-F-]{36}/content") || path.matches("/api/internal/subculture/v6/media/[0-9a-fA-F-]{36}/content"));
        boolean hasBody=!"GET".equals(request.getMethod()) && !"HEAD".equals(request.getMethod());
        int maxBody=imageBody?10*1024*1024:MAX_BODY;
        if(token==null||token.length()<32) { error(response,503,"COLLECTOR_NOT_CONFIGURED");return; }
        String authorization=request.getHeader("Authorization");
        if(authorization==null||!authorization.startsWith("Bearer ")||!matches(token,authorization.substring(7))) { error(response,401,"UNAUTHORIZED");return; }
        if(hasBody && !imageBody && (request.getContentType()==null||!request.getContentType().toLowerCase(java.util.Locale.ROOT).startsWith("application/json"))) { error(response,415,"JSON_REQUIRED");return; }
        if(request.getContentLengthLong()>maxBody) { error(response,413,"BATCH_TOO_LARGE");return; }
        byte[] body=hasBody?request.getInputStream().readNBytes(maxBody+1):new byte[0];
        if(body.length>maxBody) { error(response,413,"BATCH_TOO_LARGE");return; }
        HttpServletRequestWrapper wrapped=new HttpServletRequestWrapper(request) {
            @Override public ServletInputStream getInputStream() {
                ByteArrayInputStream input=new ByteArrayInputStream(body);
                return new ServletInputStream() {
                    public int read() { return input.read(); }
                    public int read(byte[] buffer,int off,int len) { return input.read(buffer,off,len); }
                    public boolean isFinished() { return input.available()==0; }
                    public boolean isReady() { return true; }
                    public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException("Synchronous collection endpoint"); }
                };
            }
            @Override public BufferedReader getReader() { return new BufferedReader(new InputStreamReader(getInputStream(),StandardCharsets.UTF_8)); }
            @Override public int getContentLength() { return body.length; }
            @Override public long getContentLengthLong() { return body.length; }
        };
        var context=SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken("subculture-collector",null,List.of(new SimpleGrantedAuthority("COLLECTOR_WRITE"))));
        SecurityContextHolder.setContext(context);
        try { chain.doFilter(wrapped,response); }
        finally { SecurityContextHolder.clearContext(); }
    }
    static void error(HttpServletResponse response,int status,String code) throws IOException {
        response.setStatus(status);response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"status\":"+status+",\"code\":\""+code+"\",\"message\":\"수집 요청을 처리할 수 없습니다. 설정과 권한을 확인하세요.\"}");
    }
}
