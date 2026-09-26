import java.util.*;
import com.boothhana.collection.CollectionModels.*;
public class PublishStatusReproduction {
  public static void main(String[] args) {
    for(String state:List.of("CANCELED","POSTPONED","RESCHEDULED","SCHEDULED")) {
      EventData raw=new EventData("[TEST] review", "COMIC_DOUJIN", "[TEST] organizer", "1", "SEOUL",
       "test venue", null, "test only", null, List.of(),
       List.of(new Occurrence("2026-10-10","2026-10-10",null,null)),
       List.of(new Source("https://example.com/notice","OFFICIAL","ORIGINAL","test")),
       List.of(),List.of(),"MULTI_BOOTH",List.of(),
       new OperationStatus(state,"Official test notice","https://example.com/notice","2026-09-17"));
      EventData event=new EventData(raw.name(),raw.subcategory(),raw.organizer(),raw.edition(),raw.region(),raw.venueName(),raw.address(),raw.description(),raw.admission(),raw.subjects(),raw.occurrences(),raw.sources(),List.of(),raw.warnings(),raw.eventFormat(),raw.discoveryLinks());
      if(!event.operationStatus().state().equals("UNKNOWN") || event.operationStatus().sourceUrl()!=null)
         throw new AssertionError("Behavior no longer matches reviewed defect; inspect new source");
      System.out.printf("%s -> %s; source=%s; note=%s; checkedOn=%s%n",state,event.operationStatus().state(),event.operationStatus().sourceUrl(),event.operationStatus().note(),event.operationStatus().checkedOn());
    }
    System.out.println("REPRODUCED: four explicit operation states and their evidence disappear in the actual publisher constructor expression.");
  }
}
