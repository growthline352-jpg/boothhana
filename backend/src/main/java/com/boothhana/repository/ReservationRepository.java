package com.boothhana.repository;
import com.boothhana.domain.Reservation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
public interface ReservationRepository extends JpaRepository<Reservation, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select r from Reservation r where r.id = :id")
    java.util.Optional<Reservation> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") Long id);
 List<Reservation> findByUserIdOrderByCreatedAtDesc(Long userId); List<Reservation> findByEventBoothIdInOrderByCreatedAtDesc(List<Long> eventBoothIds); Optional<Reservation> findByReservationNo(String reservationNo); long countByEventBoothId(Long eventBoothId); }
