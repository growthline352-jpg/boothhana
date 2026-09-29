package com.boothhana.support;

import java.util.*;

public final class SupportModels {
 private SupportModels() {}
 /** Namespaces prevent catalog product 42 being confused with operating product 42. */
 public record Target(String namespace,String type,long eventId,Long id,String planId,String areaId,String day,String hall) {}
 public record Create(UUID requestId,String kind,String category,String title,String body,List<String> evidence,
                      Target target,Map<String,String> context,Long exhibitorId) {}
 public record Message(UUID requestId,long revision,String body,List<String> evidence,boolean internal) {}
 public record Action(long revision,String action,String note,UUID duplicateOf,String expectedFingerprint) {}
 public record Correction(long revision,String expectedFingerprint,long targetRevision,long eventRevision,
                          Map<String,Object> overrides,String note,String reply) {}
 public record GuestCreate(Create ticket,String accessKey,String website) {}
 public record GuestAccess(UUID ticketId,String accessKey) {}
 public record GuestMessage(GuestAccess access,Message message) {}
 public record ClaimDecision(long revision,String decision,String note,String reply,Long organizerId,String verifiedName,String officialUrl) {
  public ClaimDecision(long revision,String decision,String note,String reply){this(revision,decision,note,reply,null,null,null);}
 }
 public record Revoke(long revision,String reason) {}
 public record AttachmentInput(UUID uploadId,String contentType,long size,String sha256) {}
 public record Resolved(Target target,String label,String route,Object snapshot,String fingerprint,boolean visible) {}
 public record Principal(Long userId,boolean admin,boolean guest) {
  public String actorKind() { return admin?"ADMIN":guest?"GUEST":"USER"; }
 }
}
