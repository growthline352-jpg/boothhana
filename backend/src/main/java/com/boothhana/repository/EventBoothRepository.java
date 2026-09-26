package com.boothhana.repository;
import com.boothhana.domain.EventBooth;
import com.boothhana.domain.DomainEnums.ApplicationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
public interface EventBoothRepository extends JpaRepository<EventBooth, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select b from EventBooth b where b.id=:id")
    Optional<EventBooth> findLocked(@org.springframework.data.repository.query.Param("id") Long id);
    boolean existsByEventId(Long eventId);
    long countByEventIdAndStatus(Long eventId, com.boothhana.domain.DomainEnums.ApplicationStatus status);
    long countByEventIdAndStatusAndIsPublicTrue(Long eventId, com.boothhana.domain.DomainEnums.ApplicationStatus status);
    interface EventBoothCount { Long getEventId(); long getTotal(); }
    @org.springframework.data.jpa.repository.Query("select b.eventId as eventId, count(b) as total from EventBooth b where b.eventId in :ids and b.status = :status and (:publicOnly = false or b.isPublic = true) group by b.eventId")
    java.util.List<EventBoothCount> countForEvents(
        @org.springframework.data.repository.query.Param("ids") java.util.Collection<Long> ids,
        @org.springframework.data.repository.query.Param("status") com.boothhana.domain.DomainEnums.ApplicationStatus status,
        @org.springframework.data.repository.query.Param("publicOnly") boolean publicOnly);

    List<EventBooth> findByEventIdAndStatusAndIsPublicTrue(Long eventId, ApplicationStatus status);
    List<EventBooth> findByStatusOrderByIdDesc(ApplicationStatus status);
    List<EventBooth> findAllByOrderByIdDesc();
    Optional<EventBooth> findByEventIdAndBoothId(Long eventId, Long boothId);
    List<EventBooth> findByBoothIdIn(List<Long> boothIds);
}
