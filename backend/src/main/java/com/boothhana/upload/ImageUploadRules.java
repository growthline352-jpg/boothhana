package com.boothhana.upload;

import java.util.Map;
import java.util.regex.Pattern;

/** Size, namespace and magic-byte checks; not a malware scan or full image decoder. */
public final class ImageUploadRules {
    public static final long MAX_BYTES = 10L * 1024 * 1024;
    private static final Map<String, String> EXTENSIONS = Map.of(
        "image/jpeg", ".jpg", "image/png", ".png", "image/webp", ".webp", "image/gif", ".gif");
    private ImageUploadRules() {}
    public static String extension(String type) {
        String extension = type == null ? null : EXTENSIONS.get(type);
        if (extension == null) throw new IllegalArgumentException("JPG, PNG, WebP, GIF 이미지만 업로드할 수 있습니다.");
        return extension;
    }
    public static void validateSize(Long size) {
        if (size == null || size < 1 || size > MAX_BYTES)
            throw new IllegalArgumentException("이미지 크기는 1바이트 이상 10MiB 이하여야 합니다.");
    }
    public static void validateOwnerAndTarget(Long owner, String target) {
        if (owner == null || owner < 1 || !("booth".equals(target) || "product".equals(target)))
            throw new IllegalArgumentException("이미지 업로드 대상을 확인해 주세요.");
    }
    public static void validateFinalKey(Long owner, String target, String key) {
        validateOwnerAndTarget(owner, target);
        if (key == null || key.isBlank()) return;
        if (!key.matches("^verified/" + target + "/" + owner + "/[0-9a-f-]{36}\\.(jpg|png|webp|gif)$"))
            throw new IllegalArgumentException("검증이 완료된 본인 이미지 파일만 저장할 수 있습니다.");
    }
    public static String pendingTarget(Long owner, String key) {
        if (owner == null || owner < 1 || key == null) throw new IllegalArgumentException("올바르지 않은 업로드 경로입니다.");
        Pattern pattern = Pattern.compile("^pending/(booth|product)/" + owner + "/[0-9a-f-]{36}\\.(jpg|png|webp|gif)$");
        var match = pattern.matcher(key);
        if (!match.matches()) throw new IllegalArgumentException("자신이 업로드한 임시 이미지만 확정할 수 있습니다.");
        return match.group(1);
    }
    public static void validateSignature(String type, byte[] bytes) {
        extension(type);
        boolean valid = switch (type) {
            case "image/jpeg" -> starts(bytes, 0xff, 0xd8, 0xff);
            case "image/png" -> starts(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
            case "image/gif" -> ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a");
            case "image/webp" -> ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP");
            default -> false;
        };
        if (!valid) throw new IllegalArgumentException("이미지 파일 형식과 실제 파일 헤더가 일치하지 않습니다.");
    }
    public static void validateDigest(String digest) {
        if (digest == null || !digest.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("파일 해시를 확인해 주세요.");
    }
    public static byte[] readVerified(java.io.InputStream input, long expectedSize, String type, String digest)
            throws java.io.IOException {
        validateSize(expectedSize); validateDigest(digest); extension(type);
        // Read ONE extra byte. A false or absent Content-Length cannot bypass the actual limit.
        byte[] bytes = input.readNBytes(Math.toIntExact(expectedSize + 1));
        if (bytes.length != expectedSize) throw new IllegalArgumentException("실제 이미지 크기가 요청과 다르거나 제한을 초과했습니다.");
        validateSignature(type, bytes);
        try {
            String actual = java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));
            if (!java.security.MessageDigest.isEqual(actual.getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                    digest.getBytes(java.nio.charset.StandardCharsets.US_ASCII)))
                throw new IllegalArgumentException("파일 내용이 업로드 요청과 다릅니다.");
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
        return bytes;
    }
    private static boolean starts(byte[] bytes, int... signature) {
        if (bytes == null || bytes.length < signature.length) return false;
        for (int i = 0; i < signature.length; i++) if ((bytes[i] & 0xff) != signature[i]) return false;
        return true;
    }
    private static boolean ascii(byte[] bytes, int offset, String value) {
        if (bytes == null || bytes.length < offset + value.length()) return false;
        for (int i = 0; i < value.length(); i++) if (bytes[offset + i] != value.charAt(i)) return false;
        return true;
    }
}
