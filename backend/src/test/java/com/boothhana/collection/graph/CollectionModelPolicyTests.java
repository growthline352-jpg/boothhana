package com.boothhana.collection.graph;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
class CollectionModelPolicyTests {
 @Test void lunaIsLimitedToTextExtractionAndCannotApproveOrIdentifyImages(){
  for(String kind:List.of("DISCOVERY","EVENT","PARTICIPANTS","SALES","CREATOR"))assertTrue(CollectionModelPolicy.allows("gpt-6-luna",false,kind,List.of()));
  for(String kind:List.of("CHARACTERS","RELATIONS","UNKNOWN"))assertFalse(CollectionModelPolicy.allows("gpt-6-luna",false,kind,List.of()));
  assertFalse(CollectionModelPolicy.allows("gpt-6-luna",true,"EVENT",List.of()));
  assertFalse(CollectionModelPolicy.allows("gpt-6-luna",false,"EVENT",List.of("a".repeat(64))));
  assertFalse(CollectionModelPolicy.allows("gpt-6-luna",false,"EVENT",null));
  assertFalse(CollectionModelPolicy.allows("unknown-model",false,"EVENT",List.of()));
 }
 @Test void retainsSolForReviewsComplexWorkAndResumingLegacyExtractions(){
  for(boolean review:List.of(false,true))for(String kind:List.of("DISCOVERY","EVENT","CHARACTERS","RELATIONS"))assertTrue(CollectionModelPolicy.allows("gpt-6.1-sol",review,kind,List.of()));
 }
}
