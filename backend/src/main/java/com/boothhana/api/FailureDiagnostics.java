package com.boothhana.api;

import java.util.*;

/** No exception messages: drivers/SDKs can embed SQL values, URLs and credentials in them. */
public final class FailureDiagnostics {
    private FailureDiagnostics() {}
    public static String summary(Throwable failure) {
        StringJoiner out = new StringJoiner(" <- ");
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Throwable cause = failure; cause != null && seen.add(cause) && seen.size() <= 6; cause = cause.getCause()) {
            StringJoiner frames = new StringJoiner(",");
            Arrays.stream(cause.getStackTrace()).filter(f -> f.getClassName().startsWith("com.boothhana."))
                .limit(8).forEach(f -> frames.add(f.getClassName()+"."+f.getMethodName()+":"+f.getLineNumber()));
            out.add(cause.getClass().getName()+" ["+frames+"]");
        }
        return out.toString();
    }
}
