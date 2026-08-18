package com.edgeai.industrial.repository;

import com.edgeai.industrial.domain.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ProductRepository extends JpaRepository<Product, UUID> {

    List<Product> findByStoreIdOrderByNameAsc(UUID storeId);

    Optional<Product> findByIdAndStoreId(UUID id, UUID storeId);
}
