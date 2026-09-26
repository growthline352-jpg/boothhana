package com.boothhana.library;
/** Reuses the existing 128KiB body cap and no-store policy. Auth and CSRF are NOT bypassed. */
public class LibraryRequestFilter extends com.boothhana.support.SupportRequestFilter {
 @Override protected boolean shouldNotFilter(jakarta.servlet.http.HttpServletRequest r){return !r.getRequestURI().contains("/library/");}
}
