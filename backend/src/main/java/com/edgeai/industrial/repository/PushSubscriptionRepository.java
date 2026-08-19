package com.edgeai.industrial.repository;

import com.edgeai.industrial.domain.PushSubscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PushSubscriptionRepository extends JpaRepository<PushSubscription, UUID> {

    List<PushSubscription> findByStoreId(UUID storeId);

    Optional<PushSubscription> findByEndpoint(String endpoint);
}
