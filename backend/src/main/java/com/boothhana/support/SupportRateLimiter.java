package com.boothhana.support;
import com.boothhana.api.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.time.*;
@Service
public class SupportRateLimiter {
 private final JdbcTemplate db;public SupportRateLimiter(JdbcTemplate db){this.db=db;}
 /** Called before business transactions by the NEVER facade; failed attempts still consume quota. */
 @Transactional(propagation=Propagation.REQUIRED, timeout=5)
 public int hit(String key){return db.queryForObject("insert into support_rate_limit(rate_key,window_start,hits) values(?,?,1) on conflict(rate_key,window_start) do update set hits=support_rate_limit.hits+1 returning hits",Integer.class,SupportRules.digest(key),java.sql.Timestamp.from(Instant.now().truncatedTo(java.time.temporal.ChronoUnit.HOURS)));}
}
