package com.edgeai.industrial.service;

import com.edgeai.industrial.dto.PickEventDto;
import com.edgeai.industrial.dto.ProductDemandDto;
import com.edgeai.industrial.repository.PickEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PickService {

    private final PickEventRepository pickEventRepository;

    public List<PickEventDto> getRecentPicks(UUID storeId, int hours) {
        return pickEventRepository.findRecent(storeId, hours, 200);
    }

    public List<ProductDemandDto> getProductDemand(UUID storeId, int hours) {
        return pickEventRepository.findDemandAggregate(storeId, hours);
    }
}
