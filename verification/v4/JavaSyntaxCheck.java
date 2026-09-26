import java.util.*;
import java.nio.file.*;
import javax.tools.*;
import com.sun.source.util.JavacTask;
/** Parse grammar only. Deliberately does not claim dependency resolution/type checking. */
public class JavaSyntaxCheck {
    public static void main(String[] args) throws Exception {
        var diagnostics = new DiagnosticCollector<JavaFileObject>();
        var compiler = ToolProvider.getSystemJavaCompiler();
        try (var manager=compiler.getStandardFileManager(diagnostics,null,java.nio.charset.StandardCharsets.UTF_8)) {
            var inputs=manager.getJavaFileObjectsFromStrings(Arrays.asList(args));
            var task=(JavacTask)compiler.getTask(null,manager,diagnostics,List.of("-proc:none"),null,inputs);
            int count=0;for(var unit:task.parse()){count++;}
            var errors=diagnostics.getDiagnostics().stream().filter(d->d.getKind()==Diagnostic.Kind.ERROR).toList();
            if(!errors.isEmpty())throw new AssertionError(errors.toString());
            System.out.println("PASS: Java grammar parsed for "+count+" complete source files. Spring/AWS/JPA types were NOT resolved.");
        }
    }
}
