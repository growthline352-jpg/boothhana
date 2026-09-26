package com.boothhana.floorplan;
import com.boothhana.api.ApiModels.ErrorView;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@Order(-10)
@RestControllerAdvice(assignableTypes={FloorplanWorkerController.class,FloorplanAdminController.class,FloorplanPublicController.class})
public class FloorplanExceptionAdvice {
 @ExceptionHandler({IllegalArgumentException.class,java.time.DateTimeException.class}) public ResponseEntity<ErrorView> invalid(RuntimeException e){return ResponseEntity.badRequest().body(new ErrorView(400,"FLOORPLAN_INVALID","배치도 입력값·날짜·좌표 형식을 확인하세요.",null));}
}
