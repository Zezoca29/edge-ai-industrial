package com.edgeai.industrial.service;

import com.edgeai.industrial.dto.PickEventDto;
import com.edgeai.industrial.dto.ProductDemandDto;
import com.edgeai.industrial.repository.PickEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class PickService {

    private final PickEventRepository pickEventRepository;

    public List<PickEventDto> getRecentPicks(int hours) {
        return pickEventRepository.findRecent(hours, 200);
    }

    public List<ProductDemandDto> getProductDemand(int hours) {
        return pickEventRepository.findDemandAggregate(hours);
    }
}
