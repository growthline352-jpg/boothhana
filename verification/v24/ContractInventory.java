import java.nio.file.*;
import java.util.*;
import javax.tools.*;
import com.sun.source.tree.*;
import com.sun.source.util.*;
/** Compiler AST only: no Spring dependencies, runtime handler or HTTP execution is implied. */
public class ContractInventory {
 static List<Map<String,Object>> endpoints=new ArrayList<>(),records=new ArrayList<>();
 static String annName(AnnotationTree a){String x=a.getAnnotationType().toString();return x.substring(x.lastIndexOf('.')+1);}
 static AnnotationTree ann(ModifiersTree m,String name){return m.getAnnotations().stream().filter(a->annName(a).equals(name)).findFirst().orElse(null);}
 static Map<String,ExpressionTree> args(AnnotationTree a){var out=new LinkedHashMap<String,ExpressionTree>();if(a!=null)for(var e:a.getArguments()){if(e instanceof AssignmentTree v)out.put(v.getVariable().toString(),v.getExpression());else out.put("value",e);}return out;}
 static List<String> strings(ExpressionTree e){if(e==null)return List.of("");if(e instanceof LiteralTree l&&l.getValue() instanceof String s)return List.of(s);if(e instanceof NewArrayTree n){var values=new ArrayList<String>();for(var x:n.getInitializers())values.addAll(strings(x));return values;}throw new IllegalArgumentException("Nonliteral mapping must be explicitly reviewed: "+e);}
 static List<String> paths(AnnotationTree a){var p=args(a);return strings(p.getOrDefault("path",p.get("value")));}
 static String serialize(Object o){if(o==null)return "null";if(o instanceof Boolean||o instanceof Number)return o.toString();if(o instanceof Map<?,?> m)return "{"+String.join(",",m.entrySet().stream().map(e->serialize(e.getKey().toString())+":"+serialize(e.getValue())).toList())+"}";if(o instanceof Collection<?> c)return "["+String.join(",",c.stream().map(ContractInventory::serialize).toList())+"]";String s=o.toString();return "\""+s.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r").replace("\t","\\t")+"\"";}
 static void inspect(ClassTree c,String owner,String file){
  String name=owner.isEmpty()?c.getSimpleName().toString():owner+"."+c.getSimpleName();
  if(c.getKind()==Tree.Kind.RECORD){var fields=new ArrayList<Map<String,Object>>();for(var t:c.getMembers())if(t instanceof VariableTree v&&!v.getModifiers().getFlags().contains(javax.lang.model.element.Modifier.STATIC))fields.add(Map.of("name",v.getName().toString(),"type",v.getType().toString(),"annotations",v.getModifiers().getAnnotations().toString()));records.add(Map.of("name",name,"file",file,"fields",fields));}
  List<String> base=paths(ann(c.getModifiers(),"RequestMapping"));
  for(var t:c.getMembers()){
   if(t instanceof ClassTree child)inspect(child,name,file);
   if(!(t instanceof MethodTree m)||m.getReturnType()==null)continue;
   for(var a:m.getModifiers().getAnnotations()){
    String kind=annName(a);if(!Set.of("GetMapping","PostMapping","PutMapping","PatchMapping","DeleteMapping").contains(kind))continue;
    var params=new ArrayList<Map<String,Object>>();for(var p:m.getParameters())params.add(Map.of("name",p.getName().toString(),"type",p.getType().toString(),"annotations",p.getModifiers().getAnnotations().toString()));
    var status=ann(m.getModifiers(),"ResponseStatus");
    for(String b:base)for(String sub:paths(a)){var e=new LinkedHashMap<String,Object>();e.put("controller",name);e.put("name",m.getName().toString());e.put("method",kind.replace("Mapping","").toUpperCase(Locale.ROOT));e.put("path",b+sub);e.put("returns",m.getReturnType().toString());e.put("responseStatus",status==null?"":status.toString());e.put("parameters",params);e.put("file",file);e.put("alwaysThrows",m.getBody()!=null&&!m.getBody().getStatements().isEmpty()&&m.getBody().getStatements().getLast().getKind()==Tree.Kind.THROW);endpoints.add(e);}
   }
  }
 }
 public static void main(String[] args)throws Exception{
  Path root=Path.of(args[0]).toAbsolutePath().normalize();var files=Files.walk(root.resolve("backend/src/main/java")).filter(p->p.toString().endsWith(".java")).toList();var compiler=ToolProvider.getSystemJavaCompiler();var diagnostics=new DiagnosticCollector<JavaFileObject>();
  try(var manager=compiler.getStandardFileManager(diagnostics,null,java.nio.charset.StandardCharsets.UTF_8)){
   var task=(JavacTask)compiler.getTask(null,manager,diagnostics,List.of("-proc:none"),null,manager.getJavaFileObjectsFromPaths(files));
   for(var unit:task.parse())for(var t:unit.getTypeDecls())if(t instanceof ClassTree c)inspect(c,"",root.relativize(Path.of(unit.getSourceFile().toUri())).toString());
   if(diagnostics.getDiagnostics().stream().anyMatch(d->d.getKind()==Diagnostic.Kind.ERROR))throw new AssertionError(diagnostics.getDiagnostics().toString());
  }
  System.out.println(serialize(Map.of("endpoints",endpoints,"records",records,"sourceFiles",files.size())));
 }
}
