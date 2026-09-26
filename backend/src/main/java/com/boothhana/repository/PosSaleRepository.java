package com.boothhana.repository;
import com.boothhana.domain.PosSale;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface PosSaleRepository extends JpaRepository<PosSale, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select s from PosSale s where s.id = :id")
    java.util.Optional<PosSale> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") Long id);
 List<PosSale> findByEventBoothIdInOrderBySoldAtDesc(List<Long> eventBoothIds); long countByEventBoothId(Long eventBoothId); }
