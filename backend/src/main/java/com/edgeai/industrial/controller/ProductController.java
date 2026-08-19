package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Product;
import com.edgeai.industrial.dto.ProductDto;
import com.edgeai.industrial.repository.ProductRepository;
import com.edgeai.industrial.security.CurrentStore;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/products")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class ProductController {

    private final ProductRepository productRepository;

    @GetMapping
    public List<ProductDto> list() {
        return productRepository.findByStoreIdAndActiveTrueOrderByNameAsc(CurrentStore.id())
                .stream().map(ProductController::toDto).toList();
    }

    @PostMapping
    public ProductDto create(@RequestBody ProductDto body) {
        validate(body);
        Product product = new Product();
        product.setStoreId(CurrentStore.id());
        apply(product, body);
        return toDto(productRepository.save(product));
    }

    @PutMapping("/{id}")
    public ProductDto update(@PathVariable UUID id, @RequestBody ProductDto body) {
        validate(body);
        Product product = productRepository.findByIdAndStoreId(id, CurrentStore.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Produto nao encontrado"));
        apply(product, body);
        return toDto(productRepository.save(product));
    }

    @DeleteMapping("/{id}")
    public void deactivate(@PathVariable UUID id) {
        Product product = productRepository.findByIdAndStoreId(id, CurrentStore.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Produto nao encontrado"));
        product.setActive(false);
        productRepository.save(product);
    }

    private static void validate(ProductDto body) {
        if (body.name() == null || body.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nome do produto e obrigatorio");
        }
        if (body.unitWeightG() == null || body.unitWeightG() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Peso unitario deve ser maior que zero");
        }
    }

    private static void apply(Product product, ProductDto body) {
        product.setName(body.name());
        product.setSku(body.sku());
        product.setUnitWeightG(body.unitWeightG());
        product.setToleranceG(body.toleranceG() == null ? 5.0 : body.toleranceG());
        product.setUnitPriceCents(body.unitPriceCents());
        product.setActive(body.active() == null || body.active());
    }

    private static ProductDto toDto(Product p) {
        return new ProductDto(p.getId(), p.getName(), p.getSku(), p.getUnitWeightG(),
                p.getToleranceG(), p.getUnitPriceCents(), p.getActive());
    }
}
