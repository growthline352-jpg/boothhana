package com.boothhana.floorplan;
import java.util.*;
public final class FloorplanModels {
 private FloorplanModels() {}
 public record Point(double x,double y) {}
 public record PlanScope(String hall,String zone,List<String> dates,String title) {}
 public record PlanSource(String imageUrl,String pageUrl,PlanScope scope,String evidence) {}
 public record Discovery(String status,String availableOn,List<PlanSource> plans,List<String> checkedUrls,List<String> warnings) {}
 public record Claim(String leaseId) {}
 public record Observation(String requestId,String leaseId,boolean webSearchObserved,Discovery result) {}
 public record Permission(long assetRevision,long sourceRevision,boolean allowed,String note,String credit) {}
 public record SourceEdit(long revision,PlanScope scope) {}
 public record Begin(String leaseId,long assetId,long sourceRevision,String sha256,int width,int height,long size,String contentType) {}
 public record Shape(String id,String label,List<Point> points,String recognition,boolean boundaryConfirmed,String kind) {
  public Shape(String id,String label,List<Point> points,String recognition,boolean boundaryConfirmed){this(id,label,points,recognition,boundaryConfirmed,"BOOTH");}
  public String mapKind(){return kind==null||kind.isBlank()?"BOOTH":kind;}
 }
 public record Geometry(String extractorVersion,boolean complete,List<Shape> shapes,List<String> warnings) {}
 public record Analysis(String leaseId,long revision,String sha256,Geometry geometry) {}
 public record ManualLink(long participantId,List<String> dates,String reason) {}
 public record Edit(long revision,Geometry geometry,Map<String,ManualLink> manualLinks,String note) {}
 public record Publish(long revision,boolean acceptPartial,String note) {}
 public record WatchEdit(long revision,boolean disabled) {}
 public record Failure(String leaseId,String message) {}
 public record Roster(long id,String name,List<Place> locations) {}
 public record Place(String code,String hall,String zone,List<String> dates,String mapUrl) {}
 public record Link(long participantId,List<String> dates,String method) {}
 public record MappedShape(Shape shape,String status,List<Link> links,List<Long> candidates,List<String> issues) {}
 public record Mapping(List<MappedShape> shapes,int matched,int unresolved,List<String> issues) {}
}
