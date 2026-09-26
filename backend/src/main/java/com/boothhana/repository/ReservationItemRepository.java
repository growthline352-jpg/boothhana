package com.boothhana.repository;
import com.boothhana.domain.ReservationItem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface ReservationItemRepository extends JpaRepository<ReservationItem, Long> { List<ReservationItem> findByReservationId(Long reservationId); long countByEventProductId(Long eventProductId); }
