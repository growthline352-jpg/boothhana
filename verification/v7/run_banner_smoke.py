from pathlib import Path
import importlib.util, subprocess, tempfile
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('contracts',ROOT/'verification/v5/check_java_local_types.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
stubs=dict(m.STUBS);stubs.pop('com/boothhana/collection/CatalogMediaService.java')
stubs['org/springframework/beans/factory/annotation/Value.java']='package org.springframework.beans.factory.annotation; public @interface Value {String value();}'
stubs['org/springframework/jdbc/core/JdbcTemplate.java']=stubs['org/springframework/jdbc/core/JdbcTemplate.java'].replace('public int update(', 'public Map<String,Object> queryForMap(String s,Object...args){return null;} public int update(')
with tempfile.TemporaryDirectory(prefix='v7-service-check-') as tmp:
    tmp=Path(tmp);files=[]
    for name,text in stubs.items():
        p=tmp/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text);files.append(p)
    src=ROOT/'backend/src/main/java/com/boothhana'
    files += [src/rel for rel in ['api/ApiException.java','upload/ImageUploadRules.java','upload/VerifiedImageStorage.java','collection/CollectionModels.java','collection/CollectionRules.java','collection/CatalogTaxonomy.java','collection/CatalogModels.java','collection/CatalogRules.java','collection/CatalogIdentity.java','collection/CatalogMediaService.java']]
    files.append(ROOT/'verification/v7/BannerServiceSmokeTest.java')
    subprocess.run(['javac','-encoding','UTF-8','-d',str(tmp/'classes'),*map(str,files)],check=True)
    subprocess.run(['java','-cp',str(tmp/'classes'),'BannerServiceSmokeTest'],check=True)
