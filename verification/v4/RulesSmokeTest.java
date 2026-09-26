import com.boothhana.service.StockRules;
import com.boothhana.service.RecordNumbers;
import com.boothhana.upload.ImageUploadRules;
import java.util.*;

public class RulesSmokeTest {
    static int assertions = 0;
    static void check(boolean condition) { assertions++; if (!condition) throw new AssertionError("Assertion " + assertions); }
    static void rejects(Runnable fn) { boolean rejected=false; try {fn.run();} catch(IllegalArgumentException ex){rejected=true;} check(rejected); }
    public static void main(String[] args) {
        check(StockRules.subtract(10,2)==8);
        check(StockRules.restore(8,2)==10);
        check(StockRules.subtract(1,1)==0);
        rejects(()->StockRules.subtract(0,1)); rejects(()->StockRules.subtract(null,1));
        rejects(()->StockRules.subtract(-1,1)); rejects(()->StockRules.subtract(1,0));
        rejects(()->StockRules.restore(Integer.MAX_VALUE,1)); rejects(()->StockRules.restore(1,-1));
        ImageUploadRules.validateSize(1L); assertions++;
        ImageUploadRules.validateSize(10_485_760L); assertions++;
        rejects(()->ImageUploadRules.validateSize(null)); rejects(()->ImageUploadRules.validateSize(0L));
        rejects(()->ImageUploadRules.validateSize(10_485_761L));
        check(ImageUploadRules.extension("image/png").equals(".png")); rejects(()->ImageUploadRules.extension("image/svg+xml"));
        ImageUploadRules.validateSignature("image/png",new byte[]{(byte)137,80,78,71,13,10,26,10}); assertions++;
        ImageUploadRules.validateSignature("image/jpeg",new byte[]{(byte)255,(byte)216,(byte)255}); assertions++;
        ImageUploadRules.validateSignature("image/gif","GIF89a".getBytes()); assertions++;
        ImageUploadRules.validateSignature("image/webp","RIFFxxxxWEBP".getBytes()); assertions++;
        rejects(()->ImageUploadRules.validateSignature("image/png","<script>".getBytes()));
        rejects(()->ImageUploadRules.validateSignature("image/jpeg",new byte[]{}));
        String id="12345678-1234-1234-1234-123456789abc";
        check(ImageUploadRules.pendingTarget(42L,"pending/product/42/"+id+".png").equals("product"));
        rejects(()->ImageUploadRules.pendingTarget(42L,"pending/product/43/"+id+".png"));
        rejects(()->ImageUploadRules.pendingTarget(42L,"pending/product/42/../../secret.png"));
        ImageUploadRules.validateFinalKey(42L,"product","verified/product/42/"+id+".png"); assertions++;
        rejects(()->ImageUploadRules.validateFinalKey(42L,"product","pending/product/42/"+id+".png"));
        rejects(()->ImageUploadRules.validateFinalKey(42L,"product","product/43/"+id+".png"));
        rejects(()->ImageUploadRules.validateFinalKey(42L,"product","https://evil.example/a.png"));
        Set<String> numbers=new HashSet<>();
        for(int i=0;i<10000;i++) {
            String number=RecordNumbers.create(i%2==0?"RSV":"POS");
            if(number.length()>64 || !number.matches("(?:RSV|POS)-[0-9]{6}-[0-9]{6}-[0-9a-f]{32}")) throw new AssertionError(number);
            if(!numbers.add(number)) throw new AssertionError("collision");
        }
        assertions+=2; rejects(()->RecordNumbers.create("bad"));
        System.out.println("PASS: "+assertions+" rule assertions; 10,000 generated identifiers checked.");
        System.out.println("This is NOT a Spring/JPA/PostgreSQL/R2 integration test.");
    }
}
