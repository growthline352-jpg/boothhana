#!/usr/bin/env python3
"""Language type-check changed local Java contracts against explicit dependency STUBS.
Not a Spring/Jackson/JDBC compatibility test and never used in application build.
"""
from pathlib import Path
import subprocess,tempfile
ROOT=Path(__file__).resolve().parents[2]
STUBS={
'org/springframework/stereotype/Service.java':'package org.springframework.stereotype; public @interface Service {}',
'org/springframework/transaction/annotation/Transactional.java':'package org.springframework.transaction.annotation; public @interface Transactional {boolean readOnly() default false; int timeout() default -1;}',
'org/springframework/jdbc/core/ConnectionCallback.java':'package org.springframework.jdbc.core; public interface ConnectionCallback<T>{T doInConnection(java.sql.Connection c) throws java.sql.SQLException;}',
'org/springframework/jdbc/core/RowMapper.java':'package org.springframework.jdbc.core; public interface RowMapper<T>{T mapRow(java.sql.ResultSet r,int n) throws java.sql.SQLException;}',
'org/springframework/jdbc/core/JdbcTemplate.java':'''package org.springframework.jdbc.core; import java.util.*; public class JdbcTemplate {
 public void execute(String s) {} public <T>T execute(ConnectionCallback<T> c){return null;}
 public List<Map<String,Object>> queryForList(String s,Object...args){return null;}
 public <T>List<T> query(String s,RowMapper<T> map,Object...args){return null;}
 public <T>T queryForObject(String s,Class<T> type,Object...args){return null;}
 public int update(String s,Object...args){return 0;}
}''',
'org/springframework/http/HttpStatus.java':'package org.springframework.http; public enum HttpStatus {NOT_FOUND(404),FORBIDDEN(403),CONFLICT(409),BAD_REQUEST(400),NO_CONTENT(204);private final int code;HttpStatus(int c){code=c;}public int value(){return code;}}',
'tools/jackson/databind/json/JsonMapper.java':'package tools.jackson.databind.json; public class JsonMapper {public String writeValueAsString(Object v){return null;} public <T>T readValue(String s,Class<T> c){return null;}}',
'com/boothhana/collection/CatalogMediaService.java':'''package com.boothhana.collection; import java.util.*; import static com.boothhana.collection.CatalogModels.*;
public class CatalogMediaService {public BannerSelection bannerSelection(long eventId){return new BannerSelection(null,0);} public void register(long e,Long p,Long d,Image i){} public List<AssetView> assets(long e,Long p){return List.of();} public Map<Long,AssetView> publicBanners(List<Long> ids){return Map.of();}}
'''
}
# v12: external SecurityContext types used by the catalogue review actor attribution.
STUBS.update({
'org/springframework/security/core/Authentication.java':'package org.springframework.security.core;public interface Authentication{boolean isAuthenticated();String getName();}',
'org/springframework/security/core/context/SecurityContextHolder.java':'package org.springframework.security.core.context;import org.springframework.security.core.Authentication;public class SecurityContextHolder{public static Context getContext(){return new Context();}public static class Context{public Authentication getAuthentication(){return null;}}}',
'org/springframework/security/authentication/AnonymousAuthenticationToken.java':'package org.springframework.security.authentication;public abstract class AnonymousAuthenticationToken implements org.springframework.security.core.Authentication{}',
})
def main():
 with tempfile.TemporaryDirectory(prefix='catalog-stub-contracts-') as temp:
  temp=Path(temp);files=[]
  for rel,text in STUBS.items():
   f=temp/rel;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(text);files.append(f)
  src=ROOT/'backend/src/main/java/com/boothhana'
  for name in ['CollectionModels','CollectionRules','CatalogModels','CatalogRules','CatalogIdentity','CatalogIdentityIndex','CatalogReviewRules','CatalogAccumulation','CatalogCursorRules','CatalogService','CatalogPublicationService','PublicEventProjection','CatalogBrowseQuery']:
   files.append(src/'collection'/(name+'.java'))
  files.append(src/'api/ApiException.java')
  subprocess.run(['javac','-Xlint:unchecked','-encoding','UTF-8','-d',str(temp/'classes'),*map(str,files)],check=True)
 print('PASS: local Java service/DTO type-check against explicit external API stubs. Not actual Spring/Jackson/JDBC build.')
if __name__=='__main__':main()
