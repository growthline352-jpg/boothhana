import com.boothhana.service.EventImageUpdate;
import com.boothhana.service.ProductRevisions;
import com.boothhana.upload.ImageUploadRules;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;

public class ReviewV2RulesTest {
    static int count=0;
    static void check(boolean ok){count++;if(!ok)throw new AssertionError("check "+count);}
    interface Checked {void run() throws Exception;}
    static void rejects(Checked run) throws Exception {boolean rejected=false;try{run.run();}catch(IllegalArgumentException e){rejected=true;}check(rejected);}
    static String sha(byte[] bytes) throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
    public static void main(String[] args) throws Exception {
        check("a".equals(EventImageUpdate.resolve("a",null,null)));
        check("a".equals(EventImageUpdate.resolve("a","",false)));
        check("a".equals(EventImageUpdate.resolve("a","  ",false)));
        check(EventImageUpdate.resolve("a",null,true)==null);
        check(EventImageUpdate.resolve("a","a",true)==null);
        check("b".equals(EventImageUpdate.resolve("a","b",false)));
        check(ProductRevisions.current(1L,1,2L,2));
        check(!ProductRevisions.current(1L,2,2L,2));
        check(!ProductRevisions.current(1L,1,2L,3));
        check(!ProductRevisions.current(null,1,2L,2));
        check(!ProductRevisions.current(1L,1,null,2));
        byte[] png={(byte)137,80,78,71,13,10,26,10};
        check(Arrays.equals(png,ImageUploadRules.readVerified(new ByteArrayInputStream(png),png.length,"image/png",sha(png))));
        rejects(()->ImageUploadRules.readVerified(new ByteArrayInputStream(png),png.length-1,"image/png",sha(png)));
        rejects(()->ImageUploadRules.readVerified(new ByteArrayInputStream(png),png.length+1,"image/png",sha(png)));
        rejects(()->ImageUploadRules.readVerified(new ByteArrayInputStream(png),png.length,"image/gif",sha(png)));
        rejects(()->ImageUploadRules.readVerified(new ByteArrayInputStream(png),png.length,"image/png","0".repeat(64)));
        rejects(()->ImageUploadRules.readVerified(new ByteArrayInputStream(png),10485761,"image/png",sha(png)));
        class Endless extends InputStream {int read=0;public int read(){read++;return 0;}}
        Endless endless=new Endless();
        rejects(()->ImageUploadRules.readVerified(endless,8,"image/png",sha(png)));
        check(endless.read==9); // Stops reading a lying/unbounded stream at expected size + ONE byte.
        byte[] limit=new byte[10485760];System.arraycopy(png,0,limit,0,png.length);
        check(ImageUploadRules.readVerified(new ByteArrayInputStream(limit),limit.length,"image/png",sha(limit)).length==limit.length);
        byte[] tooLarge=Arrays.copyOf(limit,limit.length+1);
        rejects(()->ImageUploadRules.readVerified(new ByteArrayInputStream(tooLarge),limit.length,"image/png",sha(limit)));
        String key="verified/product/42/12345678-1234-1234-1234-123456789abc.png";
        ImageUploadRules.validateFinalKey(42L,"product",key);count++;
        rejects(()->ImageUploadRules.validateFinalKey(43L,"product",key));
        rejects(()->ImageUploadRules.validateFinalKey(42L,"booth",key));
        rejects(()->ImageUploadRules.validateFinalKey(42L,"product",key.replace("verified/","")));
        System.out.println("PASS: "+count+" v2 rule assertions, including actual 10MiB and over-limit byte streams.");
    }
}
