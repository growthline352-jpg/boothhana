package com.boothhana.api;

import com.boothhana.api.ApiModels.ErrorView;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ApiExceptionHandler.class);
    @ExceptionHandler(ApiException.class)
    ResponseEntity<ErrorView> handle(ApiException exception) {
        return ResponseEntity.status(exception.status).body(new ErrorView(exception.status.value(), exception.code, exception.getMessage(), null));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ErrorView> handleValidation(MethodArgumentNotValidException exception) {
        Map<String, String> fields = new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors().forEach(error -> fields.putIfAbsent(error.getField(), error.getDefaultMessage()));
        return ResponseEntity.badRequest().body(new ErrorView(400, "VALIDATION_FAILED", "입력값을 확인해 주세요.", fields));
    }

    @ExceptionHandler({org.springframework.http.converter.HttpMessageNotReadableException.class,
        org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
        jakarta.validation.ConstraintViolationException.class})
    ResponseEntity<ErrorView> handleMalformedInput(Exception exception) {
        return ResponseEntity.badRequest().body(new ErrorView(400, "INVALID_INPUT", "입력 형식과 필수값을 확인해 주세요.", null));
    }

    @ExceptionHandler({org.springframework.dao.OptimisticLockingFailureException.class,
        org.springframework.dao.PessimisticLockingFailureException.class})
    ResponseEntity<ErrorView> handleConcurrentWrite(Exception exception) {
        return ResponseEntity.status(409).body(new ErrorView(409, "CONCURRENT_UPDATE", "다른 요청으로 데이터가 변경되었습니다. 다시 조회해 주세요.", null));
    }

    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
    ResponseEntity<ErrorView> handleIntegrity(Exception exception) {
        return ResponseEntity.status(409).body(new ErrorView(409, "DATA_CONFLICT", "중복되거나 연결된 데이터가 있습니다. 다시 조회해 주세요.", null));
    }

    @ExceptionHandler({org.springframework.web.servlet.resource.NoResourceFoundException.class,
        org.springframework.web.servlet.NoHandlerFoundException.class})
    ResponseEntity<ErrorView> handleNotFound(Exception exception) {
        return ResponseEntity.status(404).body(new ErrorView(404, "NOT_FOUND", "요청한 경로를 찾을 수 없습니다.", null));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorView> handleUnexpected(Exception exception, jakarta.servlet.http.HttpServletRequest request) {
        String id = java.util.UUID.randomUUID().toString();
        Object matched = request.getAttribute(org.springframework.web.servlet.HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        // Only Spring's matched route template, not arbitrary request URI/query values.
        String route = matched == null ? "UNMATCHED" : matched.toString().replaceAll("[\\r\\n]", "");
        if (route.length() > 180) route = route.substring(0,180);
        log.error("requestId={} route={} diagnostic={}", id, route, FailureDiagnostics.summary(exception));
        return ResponseEntity.internalServerError().header("X-Request-ID", id)
            .body(new ErrorView(500, "INTERNAL_ERROR", "요청을 처리하지 못했습니다.", null, id));
    }
}
