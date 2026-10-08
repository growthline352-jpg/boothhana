package com.boothhana.collection.graph;
import java.util.*;
public final class GraphModels {
 private GraphModels(){}
 public record Seed(String kind,String targetId,Map<String,Object> input,boolean baseline,String generation){}
 public record Bootstrap(UUID runId,long afterId,int size){}
 public record SourceDocument(String url,String sha256,String capturedAt,String transportUrl){
  public SourceDocument(String url,String sha256,String capturedAt){this(url,sha256,capturedAt,url);}
 }
 public record Audit(String model,String promptVersion,String schemaVersion,boolean webSearchObserved,List<String> openedUrls,Map<String,Object> usage,List<String> imageHashes,List<SourceDocument> sourceDocuments){
  public Audit(String model,String promptVersion,String schemaVersion,boolean webSearchObserved,List<String> openedUrls,Map<String,Object> usage,List<String> imageHashes){this(model,promptVersion,schemaVersion,webSearchObserved,openedUrls,usage,imageHashes,List.of());}
 }
 public record Extraction(UUID leaseToken,UUID extractionId,String contextHash,Map<String,Object> result,Audit audit){}
 public record EventDecision(int index,String verdict,String reason,Audit audit){}
 public record Decision(UUID leaseToken,UUID extractionId,String resultHash,String verdict,String reason,Audit audit,List<EventDecision> eventDecisions){
  public Decision(UUID leaseToken,UUID extractionId,String resultHash,String verdict,String reason,Audit audit){this(leaseToken,extractionId,resultHash,verdict,reason,audit,null);}
 }
 public record Failure(UUID leaseToken,String reason){}
 public record Lease(UUID leaseToken){}
}
