package com.boothhana.interests;
import java.util.*;
public final class InterestModels {
 private InterestModels() {}
 public record Entry(UUID id, UUID subjectId, Long exhibitorId, String customName, String customWork, String medium, UUID customWorkId) {}
 public record Settings(long revision, List<Entry> entries) {}
 public record SubjectInput(long revision, String kind, String name, UUID workId, String medium, List<String> aliases, String sourceUrl, boolean active) {}
 public record LinkInput(long revision, UUID subjectId, String kind, long targetId, Long eventId, Long participantId, String sourceUrl, String evidence, boolean active) {}
}
