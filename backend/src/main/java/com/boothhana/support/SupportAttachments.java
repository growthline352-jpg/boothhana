package com.boothhana.support;

import com.boothhana.api.ApiException;
import com.boothhana.upload.ImageUploadRules;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.Semaphore;
import static com.boothhana.support.SupportModels.*;

/** Network I/O runs without a transaction/DB connection. Admission limits buffer count;
 * the reverse proxy must additionally bound body read time and total connections. */
@Service
@Transactional(propagation=Propagation.NEVER)
public class SupportAttachments {
    public record Download(String type,byte[] bytes){}
    private final SupportAttachmentTransactions transactions;
    private final PrivateSupportStorage store; private final SupportRateLimiter rates;
    private final Semaphore slots;
    public SupportAttachments(SupportAttachmentTransactions transactions,PrivateSupportStorage store,
            SupportRateLimiter rates,@Value("${app.support.attachment-concurrency:4}") int concurrency) {
        if(concurrency<1||concurrency>32)throw new IllegalArgumentException("attachment-concurrency must be 1..32");
        this.transactions=transactions;this.store=store;this.rates=rates;this.slots=new Semaphore(concurrency);
    }
    public boolean available(){return store.available();}
    private void acquire(){if(!slots.tryAcquire())throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"UPLOAD_BUSY","첨부 전송이 많습니다. 같은 파일로 잠시 후 다시 시도해 주세요.");}
    public Map<String,Object> upload(UUID ticket,AttachmentInput input,Principal actor,InputStream stream)throws IOException {
        if(!available())throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PRIVATE_ATTACHMENTS_DISABLED","첨부 저장이 준비되지 않았습니다. 내용 접수는 유지됩니다.");
        if(actor.userId()==null||actor.guest())throw ApiException.forbidden("로그인이 필요합니다.");
        if(rates.hit("support-attach:"+actor.userId())>20)throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"RATE_LIMITED","요청이 많습니다. 잠시 후 다시 시도해 주세요.");
        acquire();
        try {
            var entry=transactions.prepare(ticket,input,actor);
            if(entry.stored())return Map.of("id",input.uploadId().toString(),"state","STORED");
            byte[] bytes;
            try {bytes=ImageUploadRules.readVerified(stream,input.size(),input.contentType(),input.sha256());}
            catch(IllegalArgumentException invalid) {
                transactions.abandonPending(ticket,input.uploadId(),actor);
                throw ApiException.badRequest(invalid.getMessage());
            }
            store.put(entry.key(),entry.type(),bytes,entry.sha256());
            return transactions.complete(ticket,input,actor);
        } finally {slots.release();}
    }
    public Download download(UUID ticket,UUID attachment,Principal actor) {
        acquire();
        try {
            var before=transactions.describe(ticket,attachment,actor);
            byte[] bytes=store.get(before.key(),before.size(),before.sha256());
            // Recheck authorization/row after the potentially slow remote read.
            var after=transactions.describe(ticket,attachment,actor);
            if(!before.equals(after))throw ApiException.conflict("첨부 상태가 변경되었습니다. 다시 확인해 주세요.");
            return new Download(after.type(),bytes);
        } finally {slots.release();}
    }
}
