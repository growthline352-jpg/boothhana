package com.boothhana.service;

/** Pure arithmetic rules. Persistence/locking lives in InventoryOperations. */
public final class StockRules {
    private StockRules() {}
    public static int subtract(Integer current, int quantity) {
        requireCurrent(current);
        requireQuantity(quantity);
        if (current < quantity) throw new IllegalArgumentException("재고가 부족합니다.");
        return current - quantity;
    }
    public static int restore(Integer current, int quantity) {
        requireCurrent(current);
        requireQuantity(quantity);
        try { return Math.addExact(current, quantity); }
        catch (ArithmeticException error) {
            throw new IllegalArgumentException("재고 수량의 허용 범위를 초과합니다.");
        }
    }
    private static void requireCurrent(Integer current) {
        if (current == null || current < 0) throw new IllegalArgumentException("유한 재고 값이 올바르지 않습니다.");
    }
    public static void requireQuantity(int quantity) {
        if (quantity < 1) throw new IllegalArgumentException("수량은 1 이상이어야 합니다.");
    }
}
