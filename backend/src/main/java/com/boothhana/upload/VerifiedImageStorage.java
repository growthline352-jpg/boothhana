package com.boothhana.upload;

/** Storage port: data must be bounded and verified BEFORE it is sent here. */
public interface VerifiedImageStorage {
    void put(String key, String contentType, byte[] bytes, String sha256);
    void verify(String key, String contentType, long size, String sha256);
}
