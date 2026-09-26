from pathlib import Path
import tempfile,subprocess,importlib.util
R=Path(__file__).resolve().parents[2];J=R/'backend/src/main/java/com/boothhana';V=R/'verification/v11'
spec=importlib.util.spec_from_file_location('old',R/'verification/v5/check_java_local_types.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
stubs={}
stubs['org/springframework/http/HttpStatus.java']='package org.springframework.http;public enum HttpStatus{NOT_FOUND,FORBIDDEN,CONFLICT,BAD_REQUEST,NO_CONTENT;public int value(){return 400;}}'
stubs['org/springframework/http/ResponseEntity.java']='package org.springframework.http;import java.util.*;public class ResponseEntity<T>{public int status;public T value;public Map<String,String> headers;public static Builder status(int n){return new Builder(n);}public static Builder status(HttpStatus n){return status(n.value());}public static Builder badRequest(){return status(400);}public static Builder internalServerError(){return status(500);}public static class Builder{int s;Map<String,String> h=new HashMap<>();Builder(int n){s=n;}public Builder header(String k,String v){h.put(k,v);return this;}public <T>ResponseEntity<T> body(T b){var r=new ResponseEntity<T>();r.status=s;r.value=b;r.headers=h;return r;}}}'
stubs['jakarta/servlet/http/HttpServletRequest.java']='package jakarta.servlet.http;public interface HttpServletRequest{Object getAttribute(String name);}'
stubs['org/springframework/web/servlet/HandlerMapping.java']='package org.springframework.web.servlet;public interface HandlerMapping{String BEST_MATCHING_PATTERN_ATTRIBUTE="matched";}'
stubs['org/slf4j/Logger.java']='package org.slf4j;public interface Logger{void error(String f,Object...args);}'
stubs['org/slf4j/LoggerFactory.java']='package org.slf4j;public class LoggerFactory{public static String last="";public static Logger getLogger(Class<?> c){return (f,args)->{last=f+java.util.Arrays.toString(args);};}}'
for name in ['RestControllerAdvice','ExceptionHandler']:
 stubs['org/springframework/web/bind/annotation/'+name+'.java']='package org.springframework.web.bind.annotation;public @interface '+name+'{Class<?>[] value() default {};}'
for name in ['NotBlank','NotNull','NotEmpty','Positive','PositiveOrZero','Min','Max','Size','Pattern']:
 stubs['jakarta/validation/constraints/'+name+'.java']='package jakarta.validation.constraints;@java.lang.annotation.Target({java.lang.annotation.ElementType.TYPE_USE,java.lang.annotation.ElementType.PARAMETER,java.lang.annotation.ElementType.FIELD,java.lang.annotation.ElementType.RECORD_COMPONENT}) public @interface '+name+'{long value() default 0;int max() default 2147483647;String regexp() default "";}'
stubs['jakarta/validation/Valid.java']='package jakarta.validation;@java.lang.annotation.Target({java.lang.annotation.ElementType.TYPE_USE,java.lang.annotation.ElementType.PARAMETER}) public @interface Valid{}'
for rel in ['org/springframework/http/converter/HttpMessageNotReadableException','org/springframework/web/method/annotation/MethodArgumentTypeMismatchException','jakarta/validation/ConstraintViolationException','org/springframework/dao/OptimisticLockingFailureException','org/springframework/dao/PessimisticLockingFailureException','org/springframework/dao/DataIntegrityViolationException','org/springframework/web/servlet/resource/NoResourceFoundException','org/springframework/web/servlet/NoHandlerFoundException']:
 pkg,name=rel.rsplit('/',1);stubs[rel+'.java']='package '+pkg.replace('/','.')+';public class '+name+' extends RuntimeException{}'
stubs['org/springframework/web/bind/MethodArgumentNotValidException.java']='package org.springframework.web.bind;public class MethodArgumentNotValidException extends RuntimeException{public Binding getBindingResult(){return new Binding();}public static class Binding{public java.util.List<FieldError> getFieldErrors(){return java.util.List.of();}}public static class FieldError{public String getField(){return "";}public String getDefaultMessage(){return "";}}}'
with tempfile.TemporaryDirectory(prefix='v11-http-stub-') as tmp:
 tmp=Path(tmp);files=[]
 for rel,text in stubs.items():
  p=tmp/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text);files.append(p)
 src=[J/n for n in ['api/ApiException.java','api/ApiModels.java','api/ApiExceptionHandler.java','api/FailureDiagnostics.java','domain/DomainEnums.java']]
 subprocess.run(['javac','-encoding','UTF-8','-d',str(tmp/'classes'),*map(str,files),*map(str,src),str(V/'HandlerSmoke.java')],check=True)
 subprocess.run(['java','-cp',str(tmp/'classes'),'com.boothhana.api.HandlerSmoke'],check=True)
