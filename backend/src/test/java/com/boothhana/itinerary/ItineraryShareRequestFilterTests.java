package com.boothhana.itinerary;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import static org.junit.jupiter.api.Assertions.*;

class ItineraryShareRequestFilterTests {
 @Test void acceptsUtf8BodiesWithoutChangingThem()throws Exception{var req=new MockHttpServletRequest("POST","/api/public/itinerary/shares");req.setContent("{\"title\":\"함께 가는 하루\"}".getBytes(StandardCharsets.UTF_8));var res=new MockHttpServletResponse();new ItineraryShareRequestFilter().doFilter(req,res,(r,s)->assertEquals("{\"title\":\"함께 가는 하루\"}",new String(r.getInputStream().readAllBytes(),StandardCharsets.UTF_8)));assertEquals(200,res.getStatus());}
 @Test void rejectsKnownAndChunkedOversizedBodiesBeforeController()throws Exception{
  for(boolean chunked:new boolean[]{false,true}){var req=new MockHttpServletRequest("POST","/api/public/itinerary/shares"){@Override public long getContentLengthLong(){return chunked?-1:80001;}};req.setContent(new byte[80001]);var res=new MockHttpServletResponse();new ItineraryShareRequestFilter().doFilter(req,res,(r,s)->fail("Oversized JSON reached controller"));assertEquals(413,res.getStatus());assertTrue(res.getContentAsString().contains("SHARE_TOO_LARGE"));}
 }
 @Test void leavesOtherEndpointsAndReadsUntouched()throws Exception{var req=new MockHttpServletRequest("GET","/api/public/itinerary/shares/abcdefghijklmnopqrstuv");var res=new MockHttpServletResponse();new ItineraryShareRequestFilter().doFilter(req,res,(r,s)->assertSame(req,r));}
}
