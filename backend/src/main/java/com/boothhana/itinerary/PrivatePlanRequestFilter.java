package com.boothhana.itinerary;
/** Body limit/no-store only. Authentication and CSRF continue through Spring Security. */
public class PrivatePlanRequestFilter extends com.boothhana.support.SupportRequestFilter {
 @Override protected boolean shouldNotFilter(jakarta.servlet.http.HttpServletRequest r){return !r.getRequestURI().matches("/api/me/(?:itineraries|purchase-plans)(?:/.*)?");}
}
