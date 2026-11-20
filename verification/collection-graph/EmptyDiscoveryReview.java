import java.nio.file.*;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;
import com.boothhana.collection.graph.GraphProjection;
class EmptyDiscoveryReview {
 public static void main(String[] args) throws Exception {
  var json=JsonMapper.builder().build();
  var data=json.readValue(Files.readString(Path.of(args[0])),Map.class);
  try {
   new GraphProjection(null,json,null,null,null,null,null).checkSources((Map<String,Object>)data.get("input"),(List<String>)data.get("openedUrls"));
   throw new AssertionError("Expected reproduced empty discovery rejection");
  } catch(com.boothhana.api.ApiException e) { System.out.println("EMPTY_DISCOVERY_REJECTED: "+e.getMessage()); }
 }
}
