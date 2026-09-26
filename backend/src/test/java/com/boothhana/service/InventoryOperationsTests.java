package com.boothhana.service;

import com.boothhana.api.ApiException;
import com.boothhana.api.ApiModels.LineInput;
import com.boothhana.domain.EventProduct;
import com.boothhana.domain.DomainEnums.StockMode;
import com.boothhana.repository.EventProductRepository;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class InventoryOperationsTests {
    @Test void locksInIdOrderButReturnsRequestOrder() {
        var repo = mock(EventProductRepository.class);
        EventProduct first = product(1, 10), second = product(2, 10);
        when(repo.findByIdForUpdate(1L)).thenReturn(Optional.of(first));
        when(repo.findByIdForUpdate(2L)).thenReturn(Optional.of(second));
        var result = new InventoryOperations(repo).lockLines(List.of(new LineInput(2L, 1), new LineInput(1L, 1)));
        var order = inOrder(repo);
        order.verify(repo).findByIdForUpdate(1L); order.verify(repo).findByIdForUpdate(2L);
        assertThat(result).containsExactly(second, first);
    }
    @Test void rejectsDuplicatePosAndReservationLines() {
        assertThatThrownBy(() -> InventoryOperations.validateLines(List.of(new LineInput(1L, 1), new LineInput(1L, 2))))
            .isInstanceOf(ApiException.class).hasMessageContaining("중복");
    }
    @Test void rejectsNullAndEmptyLines() {
        assertThatThrownBy(() -> InventoryOperations.validateLines(null)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> InventoryOperations.validateLines(List.of())).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> InventoryOperations.validateLines(Arrays.asList((LineInput) null))).isInstanceOf(ApiException.class);
    }
    @Test void rejectsNonPositiveQuantityBeforeLocking() {
        var repo = mock(EventProductRepository.class);
        assertThatThrownBy(() -> new InventoryOperations(repo).lockLines(List.of(new LineInput(1L, 0))))
            .isInstanceOf(ApiException.class);
        verifyNoInteractions(repo);
    }
    @Test void finiteStockIsUpdatedAndInsufficientStockIsRejected() {
        var repo = mock(EventProductRepository.class); var inventory = new InventoryOperations(repo);
        var item = product(1, 2);
        inventory.decrement(item, 2); assertThat(item.stockQuantity).isZero();
        assertThatThrownBy(() -> inventory.decrement(item, 1)).isInstanceOf(ApiException.class);
        assertThat(item.stockQuantity).isZero();
        inventory.increment(item, 2); assertThat(item.stockQuantity).isEqualTo(2);
    }
    @Test void infiniteStockDoesNotWriteAQuantity() {
        var repo = mock(EventProductRepository.class); var item = product(1, 0);
        item.stockMode = StockMode.INFINITE; item.stockQuantity = null;
        var inventory = new InventoryOperations(repo);
        inventory.decrement(item, 1); inventory.increment(item, 1);
        assertThat(item.stockQuantity).isNull(); verifyNoInteractions(repo);
    }
    @Test void overflowAndCorruptFiniteStockAreNotSilentlyAccepted() {
        assertThatThrownBy(() -> StockRules.restore(Integer.MAX_VALUE, 1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> StockRules.subtract(null, 1)).isInstanceOf(IllegalArgumentException.class);
    }
    private EventProduct product(long id, int stock) {
        var p = new EventProduct(); p.id = id; p.stockMode = StockMode.FINITE; p.stockQuantity = stock; return p;
    }
}
