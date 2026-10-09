package com.boothhana.collection.graph;

import java.util.UUID;
import static com.boothhana.collection.graph.GraphModels.Audit;

public final class EntityMediaModels {
 private EntityMediaModels() {}
 public record Candidate(String imageUrl,String pageUrl,String imageHash,String caption,String credit,
                         String identityEvidence,String usageStatus,String usageEvidence,String usageSourceUrl,
                         String identitySourceUrl,String identitySourceEvidence,Boolean sourceIsOfficial) {
  public Candidate(String imageUrl,String pageUrl,String imageHash,String caption,String credit,
                   String identityEvidence,String usageStatus,String usageEvidence,String usageSourceUrl){
   this(imageUrl,pageUrl,imageHash,caption,credit,identityEvidence,usageStatus,usageEvidence,usageSourceUrl,null,null,null);
  }
 }
 public record ExtractionInput(UUID extractionId,String kind,String targetId,String targetHash,Candidate candidate,Audit audit) {}
 public record ReviewInput(long revision,UUID extractionId,String resultHash,String verdict,String reason,Audit audit) {}
 public record FailureInput(long revision,String reason) {}
}
