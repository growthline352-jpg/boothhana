package com.boothhana.library;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;

/** Private user memories; these DTOs are never included in catalog publications or collection jobs. */
public final class LibraryModels {
    private LibraryModels() {}
    public record Target(@NotNull @Pattern(regexp="EVENT|PARTICIPANT|PRODUCT") String type,
                         @Positive long eventId, @Positive long id, Long participantId) {}
    public record Save(@NotNull @Valid Target target, @Size(max=10) String day, @Size(max=150) String hall) {}
    public record Import(@NotNull @Valid Save item, @Size(max=1000) String note, @Positive long expectedUserId) {}
    public record Resolve(@NotNull @Size(min=1,max=200) List<@Valid Target> targets) {}
    public record Edit(@Min(0) long revision, @Size(max=1000) String note,
                       @Size(max=10) String day, @Size(max=150) String hall) {}
    public record Visit(@NotBlank @Size(max=10) String day, boolean visited) {}
    public record Activity(@NotNull @Pattern(regexp="OPEN|OUTBOUND") String action) {}
    public record Link(String label, String url) {}
    public record Image(long id,String url,String credit,String sourceUrl) {}
    public record Memory(String title,String eventName,String participantName,String summary,List<String> tags) {}
    public record ProductVerification(String state,String lastSeenAt) {}
    public record Current(Memory memory,String operationState,String notice,String venue,
                          List<Map<String,Object>> occurrences,List<Map<String,Object>> locations,
                          String evidenceScope,Map<String,Object> price,String saleState,
                          List<Link> links,String publishedAt,List<String> warnings,ProductVerification verification) {
        public Current(Memory memory,String operationState,String notice,String venue,List<Map<String,Object>> occurrences,List<Map<String,Object>> locations,String evidenceScope,Map<String,Object> price,String saleState,List<Link> links,String publishedAt,List<String> warnings){this(memory,operationState,notice,venue,occurrences,locations,evidenceScope,price,saleState,links,publishedAt,warnings,null);}
        public Current(Memory memory,String operationState,String notice,String venue,List<Map<String,Object>> occurrences,List<Map<String,Object>> locations,String evidenceScope,Map<String,Object> price,String saleState,List<Link> links,String publishedAt){this(memory,operationState,notice,venue,occurrences,locations,evidenceScope,price,saleState,links,publishedAt,List.of(),null);}
    }
    public record Resolved(Target target,boolean available,Current current,Image image) { public Resolved(Target target,boolean available,Current current){this(target,available,current,null);} }
    public record Entry(UUID id,Target target,long revision,String savedAt,String updatedAt,
                        String day,String hall,String note,List<String> visitedDays,boolean available,
                        Memory saved,Current current,Image image,boolean changed,String lastOpenedAt) {}
    public record Group(long eventId,String name,int count) {}
    public record Page(List<Entry> items,int page,int size,long total,List<Group> groups) {}
    public record SaveResult(boolean created,Entry item) {}
    public record ImportResult(String result,Entry item) {}
    public record Index(UUID id,Target target,long revision,String day,String hall,List<String> visitedDays) {}
}
