package com.boothhana.collection;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;

final class CommentLanguageFilter {
    private static final List<String> BLOCKED_TERMS = List.of(
        "씨발", "시발", "ㅅㅂ", "ㅆㅂ", "개새끼", "씹새끼", "병신",
        "좆", "존나", "지랄", "애미뒤진", "느금마",
        "섹스", "야동", "딸딸이", "떡치"
    ).stream().map(CommentLanguageFilter::normalize).toList();

    private CommentLanguageFilter() {}

    static boolean containsBlockedTerm(String body) {
        String normalized = normalize(body);
        for (String term : BLOCKED_TERMS) {
            int from = 0;
            while ((from = normalized.indexOf(term, from)) >= 0) {
                if (!term.equals("시발") || !normalized.startsWith("시발점", from)) return true;
                from += term.length();
            }
        }
        return false;
    }

    private static String normalize(String value) {
        String folded = Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        StringBuilder compact = new StringBuilder(folded.length());
        folded.codePoints().filter(Character::isLetterOrDigit).forEach(compact::appendCodePoint);
        return compact.toString();
    }
}
