package com.boothhana.repository;
import com.boothhana.domain.Booth;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface BoothRepository extends JpaRepository<Booth, Long> { List<Booth> findByOwnerUserIdOrderByIdDesc(Long ownerUserId); }
