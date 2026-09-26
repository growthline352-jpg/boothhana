package com.boothhana.floorplan;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real Spring MVC binding/response test. Service is mocked; no DB/auth/CORS assertion. */
class FloorplanHttpContractTests {
 @Test void withdrawalHasNoContentSuccess() throws Exception {
  FloorplanService service=mock(FloorplanService.class);
  var mvc=MockMvcBuilders.standaloneSetup(new FloorplanAdminController(service)).build();
  UUID id=UUID.fromString("9b89617c-fc9a-4be5-87e6-32eb6eafaf0f");
  mvc.perform(post("/api/admin/subculture/v4/floorplans/versions/"+id+"/withdraw")
   .contentType("application/json").content("{\"revision\":2,\"acceptPartial\":true,\"note\":\"withdraw\"}"))
   .andExpect(status().isNoContent()).andExpect(content().string(""));
  verify(service).withdraw(id,new FloorplanModels.Publish(2,true,"withdraw"));
 }
}
