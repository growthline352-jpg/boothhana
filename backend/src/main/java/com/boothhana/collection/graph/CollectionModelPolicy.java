package com.boothhana.collection.graph;

import java.util.List;
import java.util.Set;

/** Public decisions and identity/image work require Sol; text extraction may use Luna. */
final class CollectionModelPolicy {
 static final String EXTRACTION_MODEL="gpt-6-luna";
 private static final Set<String> TEXT_KINDS=Set.of("DISCOVERY","EVENT","PARTICIPANTS","SALES","CREATOR");
 private CollectionModelPolicy(){}
 static boolean allows(String model,boolean review,String kind,List<String> images){
  // Retain already-saved Sol extractions and older workers during the API-first rollout.
  if(GraphService.MODEL.equals(model))return true;
  return EXTRACTION_MODEL.equals(model)&&!review&&kind!=null&&TEXT_KINDS.contains(kind)&&images!=null&&images.isEmpty();
 }
}
