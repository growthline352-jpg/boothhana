package com.boothhana.service;

/** Separate revisions are needed because Product is shared by several EventProducts. */
public final class ProductRevisions {
    private ProductRevisions() {}
    public static boolean current(Long eventRevision, long actualEventRevision,
                                  Long productRevision, long actualProductRevision) {
        return eventRevision != null && eventRevision == actualEventRevision
            && productRevision != null && productRevision == actualProductRevision;
    }
}
