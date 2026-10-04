package com.boothhana.itinerary;

import com.boothhana.api.ApiException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class ItineraryPlacesTests {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private static final String PLACE="{\"documents\":[{\"id\":\"123\",\"place_name\":\"서울숲 카페\",\"road_address_name\":\"서울 성동구 서울숲길 1\",\"address_name\":\"서울 성동구\",\"x\":\"127.0557\",\"y\":\"37.5445\",\"category_group_code\":\"CE7\"}]}";
    private ItineraryPlaces service(ItineraryPlaces.Transport transport) {return new ItineraryPlaces(JSON,"test-key",2000,transport);}
    @SuppressWarnings("unchecked") private List<Map<String,Object>> features(Map<String,Object> result) {return (List<Map<String,Object>>)result.get("features");}
    @Test void keysStayServerSideAndQueriesCannotChangeProviderHost() {
        var uris=new ArrayList<URI>();var service=service((uri,key)->{assertEquals("test-key",key);uris.add(uri);return PLACE;});
        var result=service.search("https://127.0.0.1/secret?x=1",37.5445,127.0557);
        assertEquals("dapi.kakao.com",uris.getFirst().getHost());assertEquals("/v2/local/search/keyword.json",uris.getFirst().getPath());
        assertTrue(uris.getFirst().getRawQuery().contains("https%3A%2F%2F127.0.0.1"));assertFalse(result.toString().contains("test-key"));
        var properties=(Map<?,?>)features(result).getFirst().get("properties");
        assertEquals("https://place.map.kakao.com/123",properties.get("place_url"));assertEquals("cafe",properties.get("osm_value"));
    }
    @Test void invalidQueriesAndCoordinatesNeverCallProvider() {
        var service=service((uri,key)->{fail("Unexpected provider request");return PLACE;});
        for(String q:List.of("a","  ","x".repeat(101),"서울\n숲"))assertThrows(ApiException.class,()->service.search(q,37.5,127));
        for(double lat:new double[]{Double.NaN,Double.POSITIVE_INFINITY,0,40})assertThrows(ApiException.class,()->service.nearby(lat,127));
    }
    @Test void nearbyCallsFoodAndCafeSeparately() {
        var categories=new ArrayList<String>();
        var result=service((uri,key)->{categories.add(uri.getQuery());return PLACE;}).nearby(37.5445,127.0557);
        assertEquals(2,features(result).size());assertTrue(categories.get(0).contains("category_group_code=FD6"));assertTrue(categories.get(1).contains("category_group_code=CE7"));
        assertTrue(categories.stream().allMatch(q->q.contains("radius=1200")&&q.contains("sort=distance")));
    }
    @Test void cacheHitsDoNotConsumeMoreQuota() {
        var calls=new AtomicInteger();var service=new ItineraryPlaces(JSON,"test-key",1,(uri,key)->{calls.incrementAndGet();return PLACE;});
        var a=service.search("서울숲",37.5445,127.0557);assertEquals(a,service.search("서울숲",37.5445,127.0557));assertEquals(1,calls.get());
        assertEquals(429,assertThrows(ApiException.class,()->service.search("홍대",37.5,127)).status.value());assertEquals(1,calls.get());
    }
    @Test void providerErrorsAreNotCachedAsAnEmptySuccessfulResult() {
        var calls=new AtomicInteger();var service=service((uri,key)->{if(calls.getAndIncrement()==0)throw new IllegalStateException("secret provider response");return PLACE;});
        var error=assertThrows(ApiException.class,()->service.search("서울숲",37.5,127));assertEquals(503,error.status.value());assertFalse(error.getMessage().contains("secret"));
        assertEquals(1,features(service.search("서울숲",37.5,127)).size());assertEquals(2,calls.get());
    }
    @Test void malformedAndForeignCoordinatesDoNotBecomeMapPins() {
        assertThrows(ApiException.class,()->service((uri,key)->"{\"documents\":{}}").search("서울숲",37.5,127));
        var result=service((uri,key)->PLACE.replace("37.5445","0")).search("서울숲",37.5,127);assertTrue(features(result).isEmpty());
    }
    @Test void addressesUseGeocodingAndKeepTheirVerifiedCoordinates() {
        var result=service((uri,key)->{assertEquals("/v2/local/search/address.json",uri.getPath());return "{\"documents\":[{\"address_name\":\"경기 수원시 영통구 광교중앙로 140\",\"x\":\"127.0594\",\"y\":\"37.286\"}]}";}).geocode("경기 수원시 영통구 광교중앙로 140");
        var feature=features(result).getFirst();assertEquals(List.of(127.0594,37.286),((Map<?,?>)feature.get("geometry")).get("coordinates"));
        assertEquals("경기 수원시 영통구 광교중앙로 140",((Map<?,?>)feature.get("properties")).get("address"));
    }
    @Test void missingCredentialDoesNotCallNetwork() {
        var service=new ItineraryPlaces(JSON,"",2000,(uri,key)->{fail("No configured credential");return PLACE;});
        assertEquals(503,assertThrows(ApiException.class,()->service.nearby(37.5,127)).status.value());
    }
}
