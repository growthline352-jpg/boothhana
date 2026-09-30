package com.boothhana.api;

import com.boothhana.api.ApiModels.*;
import com.boothhana.security.CurrentUser;
import com.boothhana.upload.R2UploadService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.util.UUID;

@RestController
@RequestMapping({"/api/creator/uploads", "/api/me/uploads"})
public class UploadController {
    private final CurrentUser current;
    private final R2UploadService uploads;
    public UploadController(CurrentUser current, R2UploadService uploads) { this.current = current; this.uploads = uploads; }
    @PostMapping("/tickets")
    public UploadTicketView register(Authentication auth, @Valid @RequestBody UploadTicketInput input, HttpServletRequest request) {
        if (request.getRequestURI().startsWith("/api/me/") && !"profile".equals(input.target()))
            throw ApiException.forbidden("프로필 이미지만 업로드할 수 있습니다.");
        return uploads.register(current.require(auth).id, input);
    }
    @PostMapping("/tickets/{id}/content") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void content(Authentication auth, @PathVariable UUID id, HttpServletRequest request) throws IOException {
        Long owner = current.require(auth).id;
        uploads.upload(owner, id, request.getContentType(), request.getContentLengthLong(), request.getInputStream(),
            request.getRequestURI().startsWith("/api/me/") ? "profile" : null);
    }
    @PostMapping("/tickets/{id}/complete")
    public UploadCompleteView complete(Authentication auth, @PathVariable UUID id, HttpServletRequest request) {
        return uploads.complete(current.require(auth).id, id,
            request.getRequestURI().startsWith("/api/me/") ? "profile" : null);
    }
    @PostMapping({"/presign", "/complete"})
    public void legacy() {
        throw new ApiException(HttpStatus.GONE, "UPLOAD_PROTOCOL_CHANGED", "이미지 업로드 방식이 변경되었습니다. 화면을 새로고침해 주세요.");
    }
}
