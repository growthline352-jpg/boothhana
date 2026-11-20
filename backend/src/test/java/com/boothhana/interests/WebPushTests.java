package com.boothhana.interests;

import com.boothhana.api.ApiException;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.Utils;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.jce.interfaces.ECPublicKey;
import org.bouncycastle.jce.interfaces.ECPrivateKey;
import org.junit.jupiter.api.Test;
import java.security.*;
import java.security.spec.ECGenParameterSpec;
import java.net.URI;
import java.net.http.HttpRequest;
import java.util.Base64;
import static org.assertj.core.api.Assertions.*;

class WebPushTests {
 @Test void arbitraryServersAndCredentialUrlsAreRejected(){
  for(String url:new String[]{"http://fcm.googleapis.com/push","https://fcm.googleapis.com.evil.test/push","https://127.0.0.1/push","https://user@fcm.googleapis.com/push","https://fcm.googleapis.com:8080/push","https://fcm.googleapis.com/push#fragment"})assertThatThrownBy(()->NotificationService.endpoint(url)).isInstanceOf(ApiException.class);
  NotificationService.endpoint("https://fcm.googleapis.com/fcm/send/test");NotificationService.endpoint("https://updates.push.services.mozilla.com/wpush/v2/test");NotificationService.endpoint("https://web.push.apple.com/test");
 }
 @Test void vapidEncryptionBuildsJdkRequestWithoutNetworkOrPlaintext()throws Exception{
  Security.addProvider(new BouncyCastleProvider());var generator=KeyPairGenerator.getInstance("ECDH","BC");generator.initialize(new ECGenParameterSpec("prime256v1"));var application=generator.generateKeyPair();var browser=generator.generateKeyPair();var base64=Base64.getUrlEncoder().withoutPadding();
  var crypto=new WebPushDispatcher.Encryption(base64.encodeToString(Utils.encode((ECPublicKey)application.getPublic())),base64.encodeToString(Utils.encode((ECPrivateKey)application.getPrivate())),"mailto:test@example.com");
  var prepared=crypto.encrypted(new Notification("https://fcm.googleapis.com/fcm/send/test",base64.encodeToString(Utils.encode((ECPublicKey)browser.getPublic())),base64.encodeToString(new byte[16]),"{\"body\":\"private text\"}"));
  assertThat(prepared.getHeaders()).containsEntry("Content-Encoding","aes128gcm");assertThat(new String(prepared.getBody(),java.nio.charset.StandardCharsets.UTF_8)).doesNotContain("private text");
  var builder=HttpRequest.newBuilder(URI.create(prepared.getUrl()));prepared.getHeaders().forEach(builder::header);assertThat(builder.POST(HttpRequest.BodyPublishers.ofByteArray(prepared.getBody())).build().method()).isEqualTo("POST");
 }
}
