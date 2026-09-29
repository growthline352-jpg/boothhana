package com.boothhana.support;

import com.boothhana.domain.UserAccount;
import com.boothhana.security.CurrentUser;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real MVC response contract; DB authorization is covered by integration tests. */
class OwnershipHttpContractTests {
 @Test void managerRevocationReturnsNoContent() throws Exception {
  var service=mock(OwnershipCatalogService.class);
  var current=mock(CurrentUser.class);
  var auth=new UsernamePasswordAuthenticationToken("admin",null,List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
  var user=new UserAccount();user.id=9L;when(current.require(auth)).thenReturn(user);
  var mvc=MockMvcBuilders.standaloneSetup(new OwnershipController(service,current)).build();
  mvc.perform(post("/api/admin/ownership/events/10/managers/2/revoke").principal(auth)
   .contentType("application/json").content("{\"revision\":3,\"reason\":\"Official role ended\"}"))
   .andExpect(status().isNoContent()).andExpect(content().string(""));
  verify(service).revokeEvent(10L,2L,new SupportModels.Revoke(3,"Official role ended"),new SupportModels.Principal(9L,true,false));
 }
}
