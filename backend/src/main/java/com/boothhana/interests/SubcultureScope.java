package com.boothhana.interests;

import com.boothhana.collection.CatalogTaxonomy;
import java.util.List;
import java.util.stream.Collectors;

/** Shared production taxonomy, never a second frozen list of subculture event types. */
public final class SubcultureScope {
 private SubcultureScope() {}
 public static final List<String> TYPES=CatalogTaxonomy.GROUPS.get("SUBCULTURE");
 public static final String SQL=TYPES.stream().map(code->{
  if(!code.matches("[A-Z_]+"))throw new IllegalStateException("Invalid taxonomy code");
  return "'"+code+"'";
 }).collect(Collectors.joining(","));
}
