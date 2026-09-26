package com.boothhana.service;

import com.boothhana.api.ApiException;
import com.boothhana.api.ApiModels.LineInput;
import com.boothhana.domain.EventProduct;
import com.boothhana.domain.DomainEnums.StockMode;
import com.boothhana.repository.EventProductRepository;
import java.util.*;

/**
 * Used only within PlatformService write transactions. It deliberately has no
 * transaction annotation: callers own the encompassing business transaction.
 * Acquire product locks in ascending ID order, never in request order.
 */
final class InventoryOperations {
    private final EventProductRepository products;
    InventoryOperations(EventProductRepository products) { this.products = products; }

    static void validateLines(List<LineInput> lines) {
        if (lines == null || lines.isEmpty() || lines.size() > 100)
            throw ApiException.badRequest("상품은 1~100개까지 선택할 수 있습니다.");
        Set<Long> seen = new HashSet<>();
        for (LineInput line : lines) {
            if (line == null || line.eventProductId() == null || line.eventProductId() < 1 || line.quantity() < 1)
                throw ApiException.badRequest("상품과 수량을 확인해 주세요.");
            if (!seen.add(line.eventProductId()))
                throw ApiException.badRequest("같은 상품을 중복 선택할 수 없습니다.");
        }
    }
    Map<Long, EventProduct> lockAll(Collection<Long> ids) {
        Map<Long, EventProduct> result = new LinkedHashMap<>();
        for (Long id : new TreeSet<>(ids)) {
            result.put(id, products.findByIdForUpdate(id)
                .orElseThrow(() -> ApiException.notFound("상품을 찾을 수 없습니다.")));
        }
        return result;
    }
    List<EventProduct> lockLines(List<LineInput> lines) {
        validateLines(lines);
        Map<Long, EventProduct> locked = lockAll(lines.stream().map(LineInput::eventProductId).toList());
        return lines.stream().map(line -> locked.get(line.eventProductId())).toList();
    }
    void decrement(EventProduct item, int quantity) {
        change(item, quantity, false);
    }
    void increment(EventProduct item, int quantity) {
        change(item, quantity, true);
    }
    private void change(EventProduct item, int quantity, boolean restore) {
        try {
            StockRules.requireQuantity(quantity);
            if (item.stockMode == StockMode.FINITE) {
                item.stockQuantity = restore ? StockRules.restore(item.stockQuantity, quantity)
                    : StockRules.subtract(item.stockQuantity, quantity);
                products.save(item);
            } else if (item.stockMode != StockMode.INFINITE) {
                throw new IllegalArgumentException("재고 모드를 확인해 주세요.");
            }
        } catch (IllegalArgumentException error) {
            throw ApiException.conflict(error.getMessage());
        }
    }
}
