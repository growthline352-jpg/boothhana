package com.boothhana.security;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
class LoginReturnPathTests {
 @Test void preservesInterestAndBoothReturnPaths(){
  for(String path:new String[]{"/account/interests","/account/notifications","/subculture/products/abc-123","/onboarding","/subculture?interestId=123","/subculture/subjects/abc-123","/subculture/creators/42","/discover/12/booths/34?product=56"})assertEquals(path,LoginReturnPath.safe(path));
 }
 @Test void rejectsExternalAndMalformedReturnPaths(){
  for(String path:new String[]{"https://example.com","//example.com","/%2fexample.com","/subculture/../admin","/subculture/unknown","/account/interests%0a","/\\example.com"})assertEquals("/",LoginReturnPath.safe(path));
 }
}
