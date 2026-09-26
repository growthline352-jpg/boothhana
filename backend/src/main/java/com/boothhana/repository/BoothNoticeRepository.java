package com.boothhana.repository;
import com.boothhana.domain.BoothNotice;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface BoothNoticeRepository extends JpaRepository<BoothNotice, Long> { List<BoothNotice> findByEventBoothIdOrderByPinnedDescCreatedAtDesc(Long eventBoothId); }
