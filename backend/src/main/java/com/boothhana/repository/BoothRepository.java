package com.boothhana.repository;
import com.boothhana.domain.Booth;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface BoothRepository extends JpaRepository<Booth, Long> { @org.springframework.data.jpa.repository.Query(value="select exists(select 1 from catalog_creator_booth where base_booth_id=:id)",nativeQuery=true)
    boolean hasCatalogRegistration(@org.springframework.data.repository.query.Param("id") Long id);
    List<Booth> findByOwnerUserIdOrderByIdDesc(Long ownerUserId); }
