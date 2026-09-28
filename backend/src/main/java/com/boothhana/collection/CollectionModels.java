package com.boothhana.collection;

import java.util.List;

/** Wire contract shared with collector/schemas/search-result.schema.json. No publication side effects. */
public final class CollectionModels {
    private CollectionModels() {}
    public record Scope(String region, String timezone, String startDate, String endDate) {}
    public record Occurrence(String startDate, String endDate, String startTime, String endTime) {}
    public record Source(String url, String kind, String access, String evidence) {}
    public record Banner(String imageUrl, String pageUrl, String rights, String rightsEvidence, Boolean matchesEdition) {}
    public record DiscoveryLink(String kind, String url, String status, String note) {}
    public record SourceCoverage(String channel, String status, List<String> queries, List<String> checkedUrls, String notes) {}
    public record OperationStatus(String state, String note, String sourceUrl, String checkedOn) {}
    public record EventData(String name, String subcategory, String organizer, String edition, String region,
        String venueName, String address, String description, String admission, List<String> subjects,
        List<Occurrence> occurrences, List<Source> sources, List<Banner> banners, List<String> warnings,
        String eventFormat, List<DiscoveryLink> discoveryLinks, OperationStatus operationStatus) {
        public EventData(String name,String subcategory,String organizer,String edition,String region,String venueName,
                String address,String description,String admission,List<String> subjects,List<Occurrence> occurrences,
                List<Source> sources,List<Banner> banners,List<String> warnings,String eventFormat,List<DiscoveryLink> discoveryLinks) {
            this(name,subcategory,organizer,edition,region,venueName,address,description,admission,subjects,occurrences,
                sources,banners,warnings,eventFormat,discoveryLinks,null);
        }
        // v3 JSON and test fixtures remain readable; new weekly discovery supplies these explicitly.
        public EventData(String name,String subcategory,String organizer,String edition,String region,String venueName,
                String address,String description,String admission,List<String> subjects,List<Occurrence> occurrences,
                List<Source> sources,List<Banner> banners,List<String> warnings) {
            this(name,subcategory,organizer,edition,region,venueName,address,description,admission,subjects,occurrences,
                sources,banners,warnings,"UNKNOWN",List.of());
        }
        public EventData { if(operationStatus==null) operationStatus=new OperationStatus("UNKNOWN",null,null,null); if(eventFormat==null) eventFormat="UNKNOWN"; if(discoveryLinks==null) discoveryLinks=List.of(); }
    }
    public record SearchResult(String schemaVersion, String searchStatus, String summary, List<String> queries,
            List<SourceCoverage> sourceCoverage, List<EventData> events) {
        public SearchResult { if(sourceCoverage==null) sourceCoverage=List.of(); }
        public SearchResult(String schemaVersion,String searchStatus,String summary,List<String> queries,List<EventData> events) {
            this(schemaVersion,searchStatus,summary,queries,List.of(),events);
        }
    }
    public record Batch(String schemaVersion, String runId, String startedAt, String finishedAt,
        String executionMode, boolean webSearchObserved, Scope scope, SearchResult result) {}
    public record Rejection(int index, String name, List<String> reasons) {}
    public record CandidateRef(int index, long id, String name) {}
    public record Receipt(String runId, String status, int inserted, int changed, int unchanged, int rejected,
            List<Rejection> rejections, List<CandidateRef> candidates) {
        public Receipt { if(candidates==null) candidates=List.of(); }
        public Receipt(String runId,String status,int inserted,int changed,int unchanged,int rejected,List<Rejection> rejections) {
            this(runId,status,inserted,changed,unchanged,rejected,rejections,List.of());
        }
    }
    public record CandidateSummary(long id, String name, String subcategory, String venueName,
        String startsOn, String endsOn, String reviewState, long revision, Long possibleDuplicateOf, String lastSeenAt) {}
    public record CandidateDetail(long id, long revision, String reviewState, EventData event,
        EventData reviewedEvent, List<String> validationWarnings, String reviewNote, Long possibleDuplicateOf,
        String firstSeenAt, String lastSeenAt, List<SourceCoverage> sourceCoverage) {}
    public record ReviewInput(long revision, String reviewState, String note) {}
    public record RunSummary(String id, String status, String executionMode, String startedAt, String finishedAt,
        Scope scope, String summary, Receipt receipt) {}
    public record PageData<T>(List<T> items, int page, int size, long total) {}
}
