#!/usr/bin/env python3
"""Compile changed controllers/services against explicit external dependency stubs.
This catches local types/signatures, not real Spring/JDBC/Jackson runtime compatibility.
"""
from pathlib import Path
import importlib.util, subprocess, tempfile
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('previous_contracts',ROOT/'verification/v5/check_java_local_types.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
stubs=dict(module.STUBS)
stubs.pop('com/boothhana/collection/CatalogMediaService.java')
stubs['org/springframework/jdbc/core/JdbcTemplate.java']=stubs['org/springframework/jdbc/core/JdbcTemplate.java'].replace('public int update(', 'public Map<String,Object> queryForMap(String s,Object...args){return null;} public int update(')
stubs['org/springframework/beans/factory/annotation/Value.java']='package org.springframework.beans.factory.annotation; public @interface Value {String value();}'
for name in ['RestController','RequestMapping','GetMapping','RequestParam','PathVariable','PostMapping','PutMapping','PatchMapping','DeleteMapping','RequestBody']:
    stubs[f'org/springframework/web/bind/annotation/{name}.java']=f'package org.springframework.web.bind.annotation; public @interface {name} {{String[] value() default {{}}; String defaultValue() default "";}}'
stubs['org/springframework/web/bind/annotation/ResponseStatus.java']='package org.springframework.web.bind.annotation; public @interface ResponseStatus {org.springframework.http.HttpStatus value();}'
with tempfile.TemporaryDirectory(prefix='v6-java-contracts-') as temp:
    temp=Path(temp);files=[]
    for rel,text in stubs.items():
        path=temp/rel;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text);files.append(path)
    src=ROOT/'backend/src/main/java/com/boothhana'
    names=['CollectionModels','CollectionRules','VisitorGuideRules','CatalogModels','CatalogRules','CatalogIdentity','CatalogIdentityIndex','CatalogReviewRules','CatalogAccumulation','CatalogCursorRules','CatalogService','CatalogPublicationService','PublicEventProjection','CatalogBrowseQuery','CatalogMediaService','CatalogPublicController','CatalogAdminController']
    files.extend(src/'collection'/(n+'.java') for n in names)
    files.extend([src/'api/ApiException.java',src/'upload/VerifiedImageStorage.java',src/'upload/ImageUploadRules.java'])
    subprocess.run(['javac','-encoding','UTF-8','-d',str(temp/'classes'),*map(str,files)],check=True)
print('PASS: changed public browse controller/media/service local contracts, with dependency stubs. Not a full backend build.')
