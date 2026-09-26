from pathlib import Path
import importlib.util,subprocess,tempfile
R=Path(__file__).resolve().parents[2]
s=importlib.util.spec_from_file_location('x',R/'verification/v5/check_java_local_types.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);stubs=dict(m.STUBS)
stubs.pop('com/boothhana/collection/CatalogMediaService.java')
stubs["org/springframework/jdbc/core/JdbcTemplate.java"]=stubs["org/springframework/jdbc/core/JdbcTemplate.java"].replace("public int update(","public Map<String,Object> queryForMap(String s,Object...args){return null;} public int update(")
stubs['org/springframework/beans/factory/annotation/Value.java']='package org.springframework.beans.factory.annotation; public @interface Value {String value();}'
stubs['org/springframework/transaction/annotation/Transactional.java']='package org.springframework.transaction.annotation; public @interface Transactional {boolean readOnly() default false; int timeout() default -1;}'
with tempfile.TemporaryDirectory() as d:
 d=Path(d);files=[]
 for name,txt in stubs.items():
  p=d/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(txt);files.append(p)
 src=R/'backend/src/main/java/com/boothhana'
 rel=['api/ApiException.java','upload/ImageUploadRules.java','upload/VerifiedImageStorage.java','collection/CollectionModels.java','collection/CollectionRules.java','collection/CatalogModels.java','collection/CatalogRules.java','collection/CatalogIdentity.java','collection/CatalogMediaService.java','floorplan/FloorplanModels.java','floorplan/FloorplanRules.java','floorplan/FloorplanImageInfo.java','floorplan/FloorplanService.java']
 files += [src/p for p in rel]
 subprocess.run(['javac','-encoding','UTF-8','-d',str(d/'out'),*map(str,files)],check=True)
 print('Actual floorplan service + models/rules/media compiled against EXPLICIT external stubs, NOT full Spring build')
