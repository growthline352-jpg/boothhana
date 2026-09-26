#!/usr/bin/env python3
"""Pure Java + local type contracts only. External Spring/JDBC/SLF4J definitions are explicit stubs."""
from pathlib import Path
import subprocess,tempfile,importlib.util
R=Path(__file__).resolve().parents[2];J=R/'backend/src/main/java/com/boothhana';V=R/'verification/v11'
def run(*args):subprocess.run(list(map(str,args)),check=True,cwd=R)
with tempfile.TemporaryDirectory(prefix='booth-v11-pure-') as tmp:
    names=['collection/CollectionModels.java','collection/PublicEventProjection.java','goods/GoodsRankingQuery.java','api/FailureDiagnostics.java','health/SchemaContract.java']
    run('javac','-encoding','UTF-8','-d',tmp,*[J/n for n in names],V/'RulesTest.java')
    run('java','-cp',tmp,'RulesTest')
spec=importlib.util.spec_from_file_location('old',R/'verification/v5/check_java_local_types.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
stubs=dict(m.STUBS)
stubs.pop('com/boothhana/collection/CatalogMediaService.java')
stubs['org/springframework/beans/factory/annotation/Value.java']='package org.springframework.beans.factory.annotation; public @interface Value {String value();}'
stubs['org/slf4j/Logger.java']='package org.slf4j;public interface Logger {default void error(String s,Object...args){} default void warn(String s,Object...args){}}'
stubs['org/slf4j/LoggerFactory.java']='package org.slf4j;public final class LoggerFactory {public static Logger getLogger(Class<?> c){return new Logger(){};}}'
stubs['org/springframework/http/ResponseEntity.java']='package org.springframework.http;public class ResponseEntity<T>{public static Builder status(int s){return new Builder();}public static Builder ok(){return new Builder();}public static class Builder{public Builder header(String a,String b){return this;}public <T>ResponseEntity<T> body(T b){return new ResponseEntity<T>();}}}'
for name in ['RestController','GetMapping','PutMapping','RequestParam','PathVariable','RequestBody']:
 stubs[f'org/springframework/web/bind/annotation/{name}.java']=f'package org.springframework.web.bind.annotation; public @interface {name} {{String[] value() default {{}};String defaultValue() default "";}}'
with tempfile.TemporaryDirectory(prefix='booth-v11-contract-') as tmp:
 tmp=Path(tmp);files=[]
 for rel,code in stubs.items():
  p=tmp/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(code);files.append(p)
 sources=[J/p for p in ['api/ApiException.java','api/FailureDiagnostics.java','goods/GoodsRankingQuery.java','goods/GoodsShowcaseService.java','goods/GoodsShowcaseController.java','health/SchemaContract.java','health/ReadinessService.java','health/HealthController.java']]
 run('javac','-encoding','UTF-8','-d',tmp/'classes',*files,*sources,V/'ServiceTest.java')
 run('java','-cp',tmp/'classes','ServiceTest')
print('PASS: new controllers and services local types; not actual dependency build.')
