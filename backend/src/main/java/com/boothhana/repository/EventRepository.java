package com.boothhana.repository;
import com.boothhana.domain.Event;
import com.boothhana.domain.DomainEnums.EventStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface EventRepository extends JpaRepository<Event, Long> { List<Event> findByStatusOrderByStartAtAsc(EventStatus status); List<Event> findAllByOrderByStartAtDesc(); }
