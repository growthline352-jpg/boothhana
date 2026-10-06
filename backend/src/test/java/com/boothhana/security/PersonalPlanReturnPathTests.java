package com.boothhana.security;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class PersonalPlanReturnPathTests {
 @Test void personalPlanningLoginKeepsSameFrontendContext(){assertEquals("/purchase-plan?event=173",LoginReturnPath.safe("/purchase-plan?event=173"));assertEquals("/itinerary?step=6",LoginReturnPath.safe("/itinerary?step=6"));}
 @Test void planningRoutesDoNotPermitExternalOrEncodedRedirects(){for(String path:new String[]{"//evil.example/purchase-plan","/%2f%2fevil.example/purchase-plan","/purchase-plan/../../admin","/itinerary/unknown","https://evil.example/itinerary"})assertEquals("/",LoginReturnPath.safe(path));}
}
