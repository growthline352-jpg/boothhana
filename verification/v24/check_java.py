"""Actual services/rules + explicit external framework/JDBC doubles, not a full build."""
from pathlib import Path
import os,importlib.util,subprocess,tempfile
HERE=Path(__file__).resolve().parent;ROOT=Path(os.environ.get('BOOTHHANA_REVIEW_BASELINE',HERE.parents[1]))
s=importlib.util.spec_from_file_location('stubs_v24',ROOT/'verification/v5/check_java_local_types.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);stubs=dict(m.STUBS)
stubs.pop('com/boothhana/collection/CatalogMediaService.java')
stubs['org/springframework/jdbc/core/JdbcTemplate.java']=stubs['org/springframework/jdbc/core/JdbcTemplate.java'].replace('public int update(','public Map<String,Object> queryForMap(String s,Object...args){return null;} public int update(')
stubs['org/springframework/beans/factory/annotation/Value.java']='package org.springframework.beans.factory.annotation; public @interface Value {String value();}'
stubs['org/springframework/transaction/annotation/Transactional.java']='package org.springframework.transaction.annotation; public @interface Transactional {boolean readOnly() default false; int timeout() default -1;}'
stubs['org/slf4j/Logger.java']='package org.slf4j;public interface Logger {default void error(String s,Object...args){} default void warn(String s,Object...args){}}'
stubs['org/slf4j/LoggerFactory.java']='package org.slf4j;public final class LoggerFactory {public static Logger getLogger(Class<?> c){return new Logger(){};}}'
s=importlib.util.spec_from_file_location('schema_v24',HERE/'schema_inventory.py');schema=importlib.util.module_from_spec(s);s.loader.exec_module(schema)
with tempfile.TemporaryDirectory(prefix='booth-v24-java-') as folder:
 d=Path(folder);files=[]
 for name,txt in stubs.items():
  p=d/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(txt);files.append(p)
 src=ROOT/'backend/src/main/java/com/boothhana'
 rel=['api/ApiException.java','api/FailureDiagnostics.java','upload/ImageUploadRules.java','upload/VerifiedImageStorage.java','collection/CollectionModels.java','collection/CollectionRules.java','collection/CatalogAreas.java','collection/VisitorGuideRules.java','collection/CatalogTaxonomy.java','interests/InterestTaxonomy.java','interests/TaxonomyRegistry.java','interests/TaxonomyRegistryData.java','collection/CatalogModels.java','collection/CatalogRules.java','collection/CatalogIdentity.java','collection/CatalogMediaService.java','floorplan/FloorplanModels.java','floorplan/FloorplanRules.java','floorplan/FloorplanImageInfo.java','floorplan/FloorplanService.java','health/SchemaContract.java','health/ReadinessService.java']
 files += [src/p for p in rel]+[HERE/'CrossLayerTest.java']
 subprocess.run(['javac','-encoding','UTF-8','-d',str(d/'out'),*map(str,files)],check=True)
 f=d/'columns.tsv';rows=[]
 for table,columns in schema.inventory(ROOT)['tables'].items():
  for col,spec in columns.items():rows.append('\t'.join([table,col,spec['udt'],str(spec['length'] or 0),str(int(spec['notNull']))]))
 f.write_text('\n'.join(rows))
 subprocess.run(['java','-cp',str(d/'out'),'CrossLayerTest',str(f)],check=True)
