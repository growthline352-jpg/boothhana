"""Compile actual new support service code with EXPLICIT stubbed external/framework boundaries.
Does not prove Jackson/SQL/AWS/Spring runtime compatibility. Tests below exercise actual service methods.
"""
from pathlib import Path
import tempfile,subprocess,importlib.util
R=Path(__file__).resolve().parents[2];J=R/'backend/src/main/java/com/boothhana';V=R/'verification/v12'
spec=importlib.util.spec_from_file_location('old',R/'verification/v5/check_java_local_types.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
STUBS=dict(m.STUBS)
STUBS.update({
'org/springframework/beans/factory/annotation/Value.java':'package org.springframework.beans.factory.annotation;public @interface Value{String value();}',
'org/springframework/transaction/annotation/Transactional.java':'package org.springframework.transaction.annotation;public @interface Transactional{boolean readOnly() default false;int timeout() default -1;Propagation propagation() default Propagation.REQUIRED;}',
'org/springframework/transaction/annotation/Propagation.java':'package org.springframework.transaction.annotation;public enum Propagation{REQUIRED,REQUIRES_NEW,MANDATORY,NEVER}',
'org/springframework/http/HttpStatus.java':'package org.springframework.http;public enum HttpStatus{BAD_REQUEST(400),UNAUTHORIZED(401),FORBIDDEN(403),NOT_FOUND(404),CONFLICT(409),NO_CONTENT(204),CREATED(201),SERVICE_UNAVAILABLE(503),TOO_MANY_REQUESTS(429);private int n;HttpStatus(int n){this.n=n;}public int value(){return n;}}',
'com/boothhana/domain/UserAccount.java':'package com.boothhana.domain;public class UserAccount{public Long id;public String displayName;}',
'com/boothhana/domain/Event.java':'package com.boothhana.domain;public class Event{public Long id;public String name;public DomainEnums.EventStatus status;}',
'com/boothhana/domain/Booth.java':'package com.boothhana.domain;public class Booth{public Long id,ownerUserId;public String name,description;}',
'com/boothhana/domain/EventBooth.java':'package com.boothhana.domain;public class EventBooth{public Long id,eventId,boothId;public long version;public String boothNumber,intro,rejectionReason;public boolean isPublic;public DomainEnums.ApplicationStatus status=DomainEnums.ApplicationStatus.PENDING;}',
'com/boothhana/service/PlatformService.java':'''package com.boothhana.service;import com.boothhana.api.ApiModels.*;import com.boothhana.domain.*;
public class PlatformService{public java.util.Optional<EventView> findPublicEvent(Long id){return java.util.Optional.ofNullable(publicEvent(id));}public java.util.Optional<BoothView> findPublicBooth(Long id){return java.util.Optional.ofNullable(publicBooth(id));}public java.util.Optional<ProductView> findPublicProduct(Long id){return java.util.Optional.ofNullable(publicProduct(id));}public java.util.Optional<ReservationView> findUserReservation(UserAccount u,Long id){return java.util.Optional.ofNullable(userReservation(u,id));}public EventView publicEvent(Long id){return null;}public BoothView publicBooth(Long id){return null;}public ProductView publicProduct(Long id){return null;}public ReservationView userReservation(UserAccount u,Long id){return null;}}''',
'com/boothhana/collection/CatalogPublicationService.java':'''package com.boothhana.collection;import java.util.*;import static com.boothhana.collection.CatalogModels.*;public class CatalogPublicationService {public Map<String,Object> data=new LinkedHashMap<>();public Optional<Map<String,Object>> findPublicDetail(long e){return data.isEmpty()?Optional.empty():Optional.of(data);}public Map<String,Object> detail(long e){return data;} public Map<String,Object> publish(long id,PublishInput i){return data;}}''',
'com/boothhana/collection/CatalogService.java':'''package com.boothhana.collection;import static com.boothhana.collection.CatalogModels.*;public class CatalogService{public void editEvent(long id,EditInput i){}public ParticipantView participant(long id){return null;}public void editParticipant(long id,EditInput i){}}''',
'com/boothhana/collection/CatalogMediaService.java':'''package com.boothhana.collection;import static com.boothhana.collection.CatalogModels.*;public class CatalogMediaService{public AssetView detail(long id){return null;}public void rights(long id,RightsInput i){}}''',
'com/boothhana/floorplan/FloorplanService.java':'''package com.boothhana.floorplan;import java.util.*;public class FloorplanService{public Map<String,Object> data=Map.of("plans",List.of());public Optional<Map<String,Object>> findPublicPlans(long id){return Optional.of(data);}public Object publicPlans(long id){return data;}public Map<String,Object> version(UUID id){return Map.of("revision",0L);}public void withdraw(UUID id,FloorplanModels.Publish p){}}''',
'com/boothhana/support/PrivateSupportStorage.java':'''package com.boothhana.support;import java.util.*;public class PrivateSupportStorage{public boolean enabled=true;public Map<String,byte[]> files=new HashMap<>();public boolean available(){return enabled;}public void put(String key,String type,byte[]b,String digest){files.put(key,b);}public byte[] get(String key,long size,String digest){return files.get(key);}}''',
})
# Test JSON registry serializes records/maps to real JSON strings but only reads previously registered values.
# It is deliberately NOT Jackson and cannot be used by the application.
STUBS['tools/jackson/databind/json/JsonMapper.java']=r'''package tools.jackson.databind.json;
import java.util.*;import java.lang.reflect.*;
public class JsonMapper {
 private static Map<String,Object> values=new HashMap<>();
 public String writeValueAsString(Object x){Object plain=plain(x);String s=serialize(plain);values.put(s,plain);return s;}
 public <T>T readValue(String s,Class<T> type){Object x=values.get(s);if("{}".equals(s))x=Map.of();if("[]".equals(s))x=List.of();if("null".equals(s))return null;if(x==null)throw new IllegalArgumentException("unregistered test json: "+s);return convert(x,type);}
 @SuppressWarnings("unchecked") private <T>T convert(Object x,Class<T> type){try{if(type.isInstance(x))return type.cast(x);if(type.isRecord()){Map<String,Object> m=(Map<String,Object>)x;var fields=type.getRecordComponents();Object[] args=new Object[fields.length];Class<?>[] types=new Class<?>[fields.length];for(int i=0;i<fields.length;i++){types[i]=fields[i].getType();Object a=m.get(fields[i].getName());if(a!=null&&types[i]==UUID.class)a=UUID.fromString(a.toString());if(a instanceof Number n){if(types[i]==long.class||types[i]==Long.class)a=n.longValue();if(types[i]==int.class||types[i]==Integer.class)a=n.intValue();}args[i]=a;}return type.getDeclaredConstructor(types).newInstance(args);}throw new IllegalArgumentException("test conversion: "+type);}catch(ReflectiveOperationException e){throw new IllegalArgumentException(e);}}
 private Object plain(Object x){try{if(x==null)return null;if(x instanceof Map<?,?> m){Map<String,Object> out=new LinkedHashMap<>();m.forEach((k,v)->out.put(k.toString(),plain(v)));return out;}if(x instanceof Collection<?> a)return a.stream().map(this::plain).toList();if(x.getClass().isRecord()){Map<String,Object> out=new LinkedHashMap<>();for(var c:x.getClass().getRecordComponents())out.put(c.getName(),plain(c.getAccessor().invoke(x)));return out;}if(x instanceof Enum<?>||x instanceof UUID||x instanceof java.time.temporal.TemporalAccessor)return x.toString();return x;}catch(ReflectiveOperationException e){throw new IllegalArgumentException(e);}}
 private String serialize(Object x){if(x==null)return "null";if(x instanceof String s)return "\""+s.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r")+"\"";if(x instanceof Map<?,?> m){List<String> bits=new ArrayList<>();m.forEach((k,v)->bits.add(serialize(k.toString())+":"+serialize(v)));return "{"+String.join(",",bits)+"}";}if(x instanceof List<?> l)return "["+String.join(",",l.stream().map(this::serialize).toList())+"]";return x.toString();}
}'''
for annotation in ['NotBlank','NotNull','NotEmpty','Positive','PositiveOrZero']:
 STUBS[f'jakarta/validation/constraints/{annotation}.java']=f'package jakarta.validation.constraints;import java.lang.annotation.*;@Target({{ElementType.FIELD,ElementType.PARAMETER,ElementType.TYPE_USE,ElementType.RECORD_COMPONENT}}) public @interface {annotation} {{}}'
for annotation in ['Max','Min','Size','Pattern']:
 STUBS[f'jakarta/validation/constraints/{annotation}.java']=f'package jakarta.validation.constraints;import java.lang.annotation.*;@Target({{ElementType.FIELD,ElementType.PARAMETER,ElementType.TYPE_USE,ElementType.RECORD_COMPONENT}}) public @interface {annotation} {{long value() default 0;int max() default 0;String regexp() default "";}}'
STUBS['jakarta/validation/Valid.java']='package jakarta.validation;import java.lang.annotation.*;@Target({ElementType.FIELD,ElementType.PARAMETER,ElementType.TYPE_USE,ElementType.RECORD_COMPONENT}) public @interface Valid{}'
# Repositories are interface boundaries in this run; actual definitions verified separately by javac syntax.
STUBS['com/boothhana/repository/EventBoothRepository.java']='''package com.boothhana.repository;import java.util.*;import com.boothhana.domain.EventBooth;public interface EventBoothRepository{Optional<EventBooth> findLocked(Long id);Optional<EventBooth> findById(Long id);Optional<EventBooth> findByEventIdAndBoothId(Long e,Long b);List<EventBooth> findByBoothIdIn(List<Long> ids);EventBooth saveAndFlush(EventBooth v);}'''
for kind in ['Booth','Event','UserAccount']:
 extra='List<Booth> findByOwnerUserIdOrderByIdDesc(Long id);' if kind=='Booth' else ''
 STUBS[f'com/boothhana/repository/{kind}Repository.java']=f'package com.boothhana.repository;import java.util.*;import com.boothhana.domain.{kind};public interface {kind}Repository{{Optional<{kind}> findById(Long id);{extra}}}'

def run():
 with tempfile.TemporaryDirectory(prefix='v12-contract-') as t:
  t=Path(t);files=[]
  for path,code in STUBS.items():
   p=t/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(code);files.append(p)
  actual=['api/ApiException.java','api/ApiModels.java','collection/CollectionModels.java','collection/CatalogModels.java','domain/DomainEnums.java','floorplan/FloorplanModels.java','upload/ImageUploadRules.java','service/ApplicationRules.java','service/ApplicationWorkflowService.java']
  actual+=['support/'+n+'.java' for n in ['SupportModels','SupportRules','SupportComparison','SupportRateLimiter','SupportTargets','SupportService','SupportResolutionService','ExhibitorClaimsService','SupportAttachmentTransactions','SupportAttachments','SupportOperations']]
  cmd=['javac','-encoding','UTF-8','-d',str(t/'classes'),*map(str,files),*[str(J/p) for p in actual]]
  if (V/'ServiceTest.java').exists():cmd.append(str(V/'ServiceTest.java'))
  subprocess.run(cmd,check=True,cwd=R)
  if (V/'ServiceTest.java').exists():subprocess.run(['java','-cp',str(t/'classes'),'com.boothhana.support.ServiceTest'],check=True,cwd=R)
 print('PASS: actual support/workflow service language contracts against explicit external & service-boundary STUBS; not Spring/SQL/AWS integration')
if __name__=='__main__':run()
