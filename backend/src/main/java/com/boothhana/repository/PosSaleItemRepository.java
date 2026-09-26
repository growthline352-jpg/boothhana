package com.boothhana.repository;
import com.boothhana.domain.PosSaleItem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface PosSaleItemRepository extends JpaRepository<PosSaleItem, Long> { List<PosSaleItem> findByPosSaleId(Long posSaleId); long countByEventProductId(Long eventProductId); }
