package com.boothhana.api;
import org.junit.jupiter.api.Test;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.servlet.HandlerMapping;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class UnexpectedErrorTests {
    @Test void errorResponseContainsCorrelationButNotSecretExceptionMessage() {
        HttpServletRequest request=mock(HttpServletRequest.class);
        when(request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE)).thenReturn("/api/admin/events/{id}");
        var response=new ApiExceptionHandler().handleUnexpected(new IllegalStateException("password=SECRET"),request);
        assertThat(response.getStatusCode().value()).isEqualTo(500);
        assertThat(response.getBody().requestId()).matches("[0-9a-f-]{36}");
        assertThat(response.getHeaders().getFirst("X-Request-ID")).isEqualTo(response.getBody().requestId());
        assertThat(response.getBody().message()).doesNotContain("SECRET");
        assertThat(FailureDiagnostics.summary(new RuntimeException("Authorization: SECRET"))).doesNotContain("SECRET");
    }
}
