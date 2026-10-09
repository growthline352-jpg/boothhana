package com.boothhana.collection.graph;
import com.boothhana.api.ApiException;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class GraphCreatorSourcesTests {
 final String profile="https://bsky.app/profile/artist.bsky.social",anchor="https://comicw.net/creator/1";
 Map<String,Object> account(){return new LinkedHashMap<>(Map.of("profileUrl",profile,"accountId","did:plc:abc","active",true,"historyComplete",false,"identityEvidence",List.of(Map.of("sourceUrl",anchor,"evidence","Named creator links this profile"),Map.of("sourceUrl",profile,"evidence","Same creator's profile"))));}
 Map<String,Object> context(List<Map<String,Object>> accounts){return Map.of("creator",Map.of("data",Map.of("profileUrl",anchor)),"publication",Map.of("data",Map.of("socialAccounts",accounts)));}
 Map<String,Object> result(String page,String next,String head,String coverage){var receipt=new LinkedHashMap<String,Object>();receipt.put("profileUrl",profile);receipt.put("accountId","did:plc:abc");receipt.put("sourceUrl",page);receipt.put("headPostId",head);receipt.put("nextPageUrl",next);var result=new LinkedHashMap<String,Object>();result.put("socialPageReceipt",receipt);result.put("nextPageUrl",next);result.put("coverage",coverage);return result;}
 @Test void checkpointMovesOnlyWhenAllPagesAreReviewed(){
  String first=profile+"?bh_feed=1",last=first+"&bh_cursor=second";var input=Map.<String,Object>of("socialPage",true,"pageUrl",first,"socialCycle","cycle-one");
  var partial=GraphCreatorSources.checkpoint(List.of(account()),input,result(first,last,"newest","PARTIAL"));assertThat(partial.getFirst()).doesNotContainKey("latestPostId").containsEntry("historyComplete",false);
  var complete=GraphCreatorSources.checkpoint(partial,Map.of("socialPage",true,"pageUrl",last,"socialCycle","cycle-one"),result(last,null,"oldest","COMPLETE"));assertThat(complete.getFirst()).containsEntry("latestPostId","newest").containsEntry("historyComplete",true).doesNotContainKey("scanHeadPostId");
 }
 @Test void cursorCannotSwitchToAnotherCreator(){var first=profile+"?bh_feed=1";var input=Map.<String,Object>of("socialPage",true,"pageUrl",first,"socialCycle","cycle");var result=result(first,null,"newest","COMPLETE");((Map<String,Object>)result.get("socialPageReceipt")).put("profileUrl","https://bsky.app/profile/another.bsky.social");assertThatThrownBy(()->GraphCreatorSources.checkpoint(List.of(account()),input,result)).isInstanceOf(ApiException.class);}
 @Test void unlinkKeepsOwnerTombstoneSoRecycledHandlesCannotBeReassigned(){var incoming=account();incoming.put("action","UNLINK");incoming.put("accountId","did:plc:other");var removed=GraphCreatorSources.merge(context(List.of(account())),List.of(incoming));assertThat(removed.getFirst()).containsEntry("active",false).containsEntry("accountId","did:plc:abc");incoming.put("action","KEEP");assertThatThrownBy(()->GraphCreatorSources.merge(context(removed),List.of(incoming))).isInstanceOf(ApiException.class);}
 @Test void accountNormalizationRejectsPostsAndForeignHosts(){assertThat(GraphCreatorSources.accountUrl("https://twitter.com/Artist/")).isEqualTo("https://x.com/artist");for(String url:List.of("https://x.com/search","https://x.com/artist/status/123","https://x.com.evil.test/artist","https://www.instagram.com/p/123","https://artist.postype.com/post/123","https://x.com:444/artist"))assertThatThrownBy(()->GraphCreatorSources.accountUrl(url)).isInstanceOf(ApiException.class);}
}
