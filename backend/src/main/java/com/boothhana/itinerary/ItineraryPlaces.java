package com.boothhana.itinerary;

import com.boothhana.api.ApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

/** Public venue lookup only. Credentials and provider requests stay on the server. */
@Service
public class ItineraryPlaces {
    interface Transport { String get(URI uri, String key) throws Exception; }
    private record Cached(Map<String,Object> value, Instant expires) {}
    private final String key;
    private final JsonMapper json;
    private final Transport transport;
    private final int dailyLimit;
    private final Map<String,Cached> cache = new LinkedHashMap<>();
    private LocalDate quotaDay;
    private long quotaMinute;
    private int dayCalls, minuteCalls;

    @Autowired
    public ItineraryPlaces(JsonMapper json,
            @Value("${KAKAO_LOCAL_API_KEY:${KAKAO_CLIENT_ID:}}") String key,
            @Value("${ITINERARY_PLACE_DAILY_LIMIT:2000}") int dailyLimit) {
        this(json,key,dailyLimit,new Transport() {
            private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
            public String get(URI uri,String credential) throws Exception {
                var request=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5)).header("Authorization","KakaoAK "+credential).GET().build();
                var response=client.send(request,HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                if(response.statusCode()!=200||response.body().length()>100_000)throw new IllegalStateException("Place provider unavailable");
                return response.body();
            }
        });
    }
    ItineraryPlaces(JsonMapper json,String key,int dailyLimit,Transport transport) {
        this.json=json;this.key=key;this.dailyLimit=Math.max(1,Math.min(10_000,dailyLimit));this.transport=transport;
    }
    static void point(double lat,double lon) {
        if(!Double.isFinite(lat)||!Double.isFinite(lon)||lat<33||lat>39||lon<124||lon>132)throw ApiException.badRequest("국내 장소 위치를 선택하세요.");
    }
    static String query(String value) {
        if(value==null||value.strip().length()<2||value.strip().length()>100||value.chars().anyMatch(Character::isISOControl))throw ApiException.badRequest("장소 이름·주소를 2~100자로 입력하세요.");
        return value.strip();
    }
    public Map<String,Object> search(String q,double lat,double lon) {
        point(lat,lon);String text=query(q);
        return lookup("keyword.json",Map.of("query",text,"x",Double.toString(lon),"y",Double.toString(lat),"size","6"),false);
    }
    public Map<String,Object> geocode(String address) {
        String text=query(address);
        return lookup("address.json",Map.of("query",text,"size","3"),true);
    }
    public Map<String,Object> nearby(double lat,double lon) {
        point(lat,lon);
        var features=new ArrayList<Object>();
        for(String category:List.of("FD6","CE7")) {
            var result=lookup("category.json",Map.of("category_group_code",category,"x",Double.toString(lon),"y",Double.toString(lat),"radius","1200","size","8","sort","distance"),false);
            features.addAll((List<?>)result.get("features"));
        }
        return Map.of("type","FeatureCollection","features",features);
    }
    private Map<String,Object> lookup(String route,Map<String,String> params,boolean address) {
        if(key.isBlank()||key.equals("local-placeholder"))throw unavailable();
        String query=params.entrySet().stream().sorted(Map.Entry.comparingByKey()).map(e->e.getKey()+"="+URLEncoder.encode(e.getValue(),StandardCharsets.UTF_8)).reduce((a,b)->a+"&"+b).orElse("");
        String cacheKey=route+"?"+query;
        synchronized(cache) {
            var hit=cache.get(cacheKey);
            if(hit!=null&&hit.expires().isAfter(Instant.now()))return hit.value();
        }
        permit();
        try {
            // The route is an internal constant. User text never controls the host or path.
            var root=json.readTree(transport.get(URI.create("https://dapi.kakao.com/v2/local/search/"+cacheKey),key));
            var docs=root.get("documents");
            if(docs==null||!docs.isArray()||docs.size()>15)throw new IllegalStateException("Invalid provider result");
            var features=new ArrayList<Map<String,Object>>();
            for(var row:docs) {
                double lat=Double.parseDouble(row.path("y").asText()),lon=Double.parseDouble(row.path("x").asText());
                try { point(lat,lon); } catch(ApiException invalid) { continue; }
                String id=address?"address-"+row.path("address_name").asText():row.path("id").asText();
                String name=address?row.path("address_name").asText():row.path("place_name").asText();
                if(id.isBlank()||name.isBlank()||name.length()>200||id.length()>400)continue;
                String street=address?name:row.path("road_address_name").asText();
                if(street.isBlank())street=row.path("address_name").asText();
                String type=row.path("category_group_code").asText();
                String url=address?"https://map.kakao.com/?q="+URLEncoder.encode(name,StandardCharsets.UTF_8):id.matches("[0-9]{1,20}")?"https://place.map.kakao.com/"+id:"";
                var properties=Map.of("provider","KAKAO","place_id",id,"name",name,"address",street,"place_url",url,"osm_value",type.equals("CE7")?"cafe":type.equals("FD6")?"restaurant":"place");
                features.add(Map.of("type","Feature","geometry",Map.of("type","Point","coordinates",List.of(lon,lat)),"properties",properties));
            }
            Map<String,Object> value=Map.of("type","FeatureCollection","features",List.copyOf(features));
            synchronized(cache) {
                cache.entrySet().removeIf(e->!e.getValue().expires().isAfter(Instant.now()));
                if(cache.size()>=256)cache.remove(cache.keySet().iterator().next());
                cache.put(cacheKey,new Cached(value,Instant.now().plusSeconds(900)));
            }
            return value;
        } catch(InterruptedException e) { Thread.currentThread().interrupt();throw unavailable(); }
        catch(Exception e) { throw unavailable(); }
    }
    private synchronized void permit() {
        var today=LocalDate.now(ZoneId.of("Asia/Seoul"));long minute=System.currentTimeMillis()/60_000;
        if(!today.equals(quotaDay)){quotaDay=today;dayCalls=0;}
        if(minute!=quotaMinute){quotaMinute=minute;minuteCalls=0;}
        if(dayCalls>=dailyLimit||minuteCalls>=120)throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"PLACE_LIMIT","장소 검색 요청이 많아요. 잠시 후 다시 시도해 주세요.");
        dayCalls++;minuteCalls++;
    }
    private static ApiException unavailable() { return new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PLACE_UNAVAILABLE","장소 검색에 연결하지 못했어요. 직접 입력하거나 잠시 후 다시 시도해 주세요."); }
}
