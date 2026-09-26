package com.boothhana.repository;
import com.boothhana.domain.EventProduct;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface EventProductRepository extends JpaRepository<EventProduct, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select p from EventProduct p where p.id = :id")
    java.util.Optional<EventProduct> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") Long id);
 List<EventProduct> findByEventBoothIdOrderByIdDesc(Long eventBoothId); List<EventProduct> findByEventBoothIdAndIsPublicTrueOrderByIdDesc(Long eventBoothId); long countByProductId(Long productId); }
