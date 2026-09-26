package com.boothhana.repository;
import com.boothhana.domain.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select u from UserAccount u where u.id = :id")
    java.util.Optional<UserAccount> lockUploadOwner(@org.springframework.data.repository.query.Param("id") Long id);
 Optional<UserAccount> findByKakaoSubject(String kakaoSubject); }
