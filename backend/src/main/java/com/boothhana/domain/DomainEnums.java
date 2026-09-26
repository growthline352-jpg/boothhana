package com.boothhana.domain;

public final class DomainEnums {
    private DomainEnums() {}

    public enum Permission { FAN, CREATOR, ADMIN }
    public enum EventStatus { DRAFT, PUBLISHED, ENDED }
    public enum ApplicationStatus { PENDING, APPROVED, REJECTED, WITHDRAWN }
    public enum StockMode { FINITE, INFINITE }
    public enum ReservationStatus { RESERVED, PICKED_UP, CANCELED }
    public enum PosStatus { SOLD, CANCELED }
    public enum PaymentMethod { CASH, TRANSFER, OTHER }
}
