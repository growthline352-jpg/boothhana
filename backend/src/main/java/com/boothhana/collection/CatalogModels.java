package com.boothhana.collection;

import java.util.List;
import java.util.Map;
import static com.boothhana.collection.CollectionModels.*;

/** External information only. Never used to grant account/booth ownership or make stock promises. */
public final class CatalogModels {
    private CatalogModels() {}
    public record Location(String code, String status, String hall, String zone, String startDate, String endDate, String floorPlanUrl) {}
    public record Member(String name, String kind, List<String> aliases, String profileUrl) {}
    public record Image(String type, String imageUrl, String pageUrl, String rightsEvidence, String caption) {}
    public record Identity(String sourceSystem, String entryId, String detailUrl) {}
    public record Participant(String sourceEntryId, String registrationName, String kind, List<Member> members,
        List<Location> locations, List<String> subjects, String description, List<String> officialLinks, List<Source> sources,
        List<Image> images, List<String> warnings, Identity identity) {
        public Participant(String sourceEntryId,String registrationName,String kind,List<Member> members,
                List<Location> locations,List<String> subjects,String description,List<String> officialLinks,List<Source> sources,
                List<Image> images,List<String> warnings) {
            this(sourceEntryId,registrationName,kind,members,locations,subjects,description,officialLinks,sources,images,warnings,null);
        }
        /** Read legacy snapshots that predate a dedicated participant description. */
        public Participant(String sourceEntryId,String registrationName,String kind,List<Member> members,
                List<Location> locations,List<String> subjects,List<String> officialLinks,List<Source> sources,
                List<Image> images,List<String> warnings,Identity identity) {
            this(sourceEntryId,registrationName,kind,members,locations,subjects,null,officialLinks,sources,images,warnings,identity);
        }
    }
    public record Price(String amount, String currency, String checkedOn, String note) {}
    public record ProductData(String sourceEntryId, String name, String summary, String memberName,
        List<String> categories, List<String> subjects, String evidenceScope, Price price, String saleState,
        String productUrl, List<Source> sources, List<Image> images, List<String> warnings, Identity identity) {
        public ProductData(String sourceEntryId,String name,String summary,String memberName,List<String> categories,
                List<String> subjects,String evidenceScope,Price price,String saleState,String productUrl,
                List<Source> sources,List<Image> images,List<String> warnings) {
            this(sourceEntryId,name,summary,memberName,categories,subjects,evidenceScope,price,saleState,productUrl,sources,images,warnings,null);
        }
    }
    public record Sales(String summary, String evidenceScope, List<String> categories, List<String> subjects,
        String salesMethod, List<Source> sources, List<Image> images, List<ProductData> products, List<String> warnings) {}
    public record Coverage(String completeness, Integer reportedTotal, String totalUnit,
        List<String> visitedPages, String nextPageUrl, List<String> warnings) {}
    public record StageResult(String searchStatus, String summary, List<String> queries, Coverage coverage,
        List<Participant> participants, Sales sales) {}
    public record CursorRef(String sourceKey,long passNo,int pageIndex,String requestedUrl,long revision) {}
    public record SalesAttemptInput(String state,String reason) {}
    public record StageBatch(String schemaVersion, String runId, String pipelineId, String stage, long eventId,
        Long participantId, long targetRevision, String startedAt, String finishedAt, boolean webSearchObserved,
        StageResult result, CursorRef cursor) {
        public StageBatch(String schemaVersion,String runId,String pipelineId,String stage,long eventId,
                Long participantId,long targetRevision,String startedAt,String finishedAt,boolean webSearchObserved,StageResult result) {
            this(schemaVersion,runId,pipelineId,stage,eventId,participantId,targetRevision,startedAt,finishedAt,webSearchObserved,result,null);
        }
    }
    public record StageReceipt(String runId, String status, int inserted, int changed, int unchanged, int rejected,
        List<Long> participantIds, List<String> issues) {}
    public record PipelineInput(String runId, String weekKey, Scope scope) {}
    public record PipelineFinish(String state, Map<String,Object> summary) {}
    public record EditInput(long revision, String reviewState, String note, Map<String,Object> overrides, List<String> clearOverrides) {
        public EditInput(long revision,String reviewState,String note,Map<String,Object> overrides) {
            this(revision,reviewState,note,overrides,List.of());
        }
        public EditInput { if(clearOverrides==null) clearOverrides=List.of(); }
    }
    public record RightsInput(long revision, String rightsState, String note, String credit, boolean offlineAllowed) {
        public RightsInput(long revision,String rightsState,String note,String credit){this(revision,rightsState,note,credit,false);}
    }
    public record AssetRegistrationInput(Long participantId, Long productId, Image image) {}
    public record BannerSelection(Long assetId, long revision) {}
    public record BannerInput(Long assetId, long revision, Long assetRevision) {}
    public record PublishInput(long eventRevision) {}
    public record AssetFailure(long revision, String reason) {}
    public record ParticipantView(long id, long eventId, long revision, String reviewState, Participant data,
        Participant collectedData, String reviewNote, String lastSeenAt, SalesView sales, List<AssetView> assets, Map<String,Object> overrides) {}
    public record ProductCheck(String state,String lastSeenAt) {}
    public record ProductRow(Long id,ProductData data,ProductCheck verification) {}
    public record SalesView(long revision, String reviewState, Sales data, Sales collectedData, String reviewNote,
        String collectedAt, Map<String,Object> overrides, List<ProductRow> productRows) {}
    public record AssetView(long id, long eventId, Long participantId, Long productId, long revision, String type,
        String imageUrl, String pageUrl, String caption, String rightsEvidence, String rightsState, String rightsNote,
        String storageState, String storedUrl, String error, String credit, boolean offlineAllowed) {
        public AssetView(long id,long eventId,Long participantId,Long productId,long revision,String type,
            String imageUrl,String pageUrl,String caption,String rightsEvidence,String rightsState,String rightsNote,
            String storageState,String storedUrl,String error,String credit){
            this(id,eventId,participantId,productId,revision,type,imageUrl,pageUrl,caption,rightsEvidence,rightsState,rightsNote,storageState,storedUrl,error,credit,false);
        }
    }
}
