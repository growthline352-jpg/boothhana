"""Fail-closed SOURCE contract audit. Does not claim live routes, JDBC SQL execution or DTO binding.
Compiler ASTs cover API call sites and controller mappings. Opaque forwarded bodies are listed,
not silently treated as schema-validated. Real HTTP/SQL tests remain mandatory in release_gate.
"""
from pathlib import Path
import os,sys,json,re,subprocess,tempfile
from schema_inventory import inventory
HERE=Path(__file__).resolve().parent;ROOT=Path(os.environ.get('BOOTHHANA_REVIEW_BASELINE',HERE.parents[1]))
OUT=HERE/'results';OUT.mkdir(exist_ok=True)
def norm(p):return re.sub(r'\{[^}]*\}','{}',p.split('?')[0])
def run():
    issues=[]
    with tempfile.TemporaryDirectory(prefix='booth-contract-') as folder:
        subprocess.run(['javac','-d',folder,str(HERE/'ContractInventory.java')],check=True)
        java=json.loads(subprocess.check_output(['java','-cp',folder,'ContractInventory',str(ROOT)],text=True))
    front=json.loads(subprocess.check_output(['node',str(HERE/'frontend_contracts.cjs'),str(ROOT)],text=True))
    routes={};duplicate=[]
    for e in java['endpoints']:
        key=(e['method'],norm(e['path']))
        if key in routes:duplicate.append(key)
        routes[key]=e
        if e['returns']=='void' and not e['alwaysThrows'] and 'NO_CONTENT' not in e['responseStatus']:issues.append('Empty success must declare NO_CONTENT: '+e['path'])
    if duplicate:issues.append('Duplicate controller routes: '+str(duplicate))
    # Spring Security registers this handler outside @RestController. Pin it to source evidence.
    security='\n'.join(p.read_text() for p in (ROOT/'backend/src/main/java').rglob('*.java') if 'Security' in p.name)
    filters={('POST','/api/logout')}
    if '/api/logout' not in security or '204' not in security:issues.append('Security logout handler proof missing')
    body_checks=[];opaque=[];route_matches=0
    def record_for(e,typ):
        candidates=[r for r in java['records'] if r['name']==typ or r['name'].endswith('.'+typ)]
        local=[r for r in candidates if Path(r['file']).parent==Path(e['file']).parent]
        if len(local)==1:return local[0]
        source=(ROOT/e['file']).read_text()
        imports=re.findall(r'import\s+(?:static\s+)?([\w.]+)(?:\*)?;',source)
        for r in candidates:
            owner=r['name'].split('.')[0]
            if any('.'+owner+'.' in i+'.' for i in imports):return r
        return candidates[0] if len(candidates)==1 else None
    for c in front['calls']:
        for path in c['paths']:
            key=(c['method'],norm(path));e=routes.get(key)
            if e is None:
                if key not in filters:issues.append(f"Unmapped API call {c['file']}:{c['line']} {key}")
                continue
            route_matches+=1
            required=[p for p in e['parameters'] if 'RequestBody' in p['annotations']]
            if c['bodyFields'] is not None and len(required)==1:
                rec=record_for(e,required[0]['type'])
                if rec is not None and all(c['bodyFields']):
                    actual=set(c['bodyFields']);expected={f['name'] for f in rec['fields']}
                    mandatory={f['name'] for f in rec['fields'] if f['type'] in ('boolean','long','int','double') or 'NotNull' in f['annotations'] or 'NotBlank' in f['annotations']}
                    extra=actual-expected;missing=mandatory-actual
                    check={'file':c['file'],'line':c['line'],'dto':rec['name'],'fields':sorted(actual),'extra':sorted(extra),'missingRequired':sorted(missing)};body_checks.append(check)
                    if extra or missing:issues.append('Request record field mismatch: '+str(check))
                    continue
            if required:opaque.append({'file':c['file'],'line':c['line'],'path':path,'bodyType':required[0]['type'],'reason':'forwarded/variable/nested body: runtime binding coverage required'})
    # Every unresolvable api(...) invocation is a reviewed forwarding helper, not a vanished endpoint.
    allowed={
        # publicRead is the reviewed idempotent GET wrapper that adds the Render
        # cold-start deadline/retry before forwarding to api(...).
        ('frontend/src/api/client.ts','path'),
        ('frontend/src/features/library/api.ts','path'),
        ('frontend/src/features/support/api.ts','url'),
    }
    for f in front['forwarders']:
        if (f['file'],f['expression']) not in allowed:issues.append('Unreviewed API forwarding expression: '+str(f))
    schema=inventory(ROOT)
    if schema['readinessColumnsMismatch']:issues.append('DDL/readiness required-column mismatch: '+str(schema['readinessColumnsMismatch']))
    source=(ROOT/'backend/src/main/java/com/boothhana/health/SchemaContract.java').read_text();m=re.search(r'COLUMN_SPEC\s*=\s*"""(.*?)"""',source,re.S)
    if m is None:issues.append('Typed database readiness contract is missing')
    else:
        declared={}
        for line in m.group(1).strip().splitlines():
            table,row=line.strip().split('=',1)
            for cell in row.split(','):
                name,typ,size,required=cell.split(':');declared[(table,name)]=(typ,int(size),required=='1')
        expected={(table,name):(v['udt'],v['length'] or 0,v['notNull']) for table,columns in schema['tables'].items() for name,v in columns.items()}
        if declared!=expected:issues.append('DDL / typed-column manifest drift')
    import jsonschema
    schema_files=list((ROOT/'collector/schemas').glob('*.json'))
    for p in schema_files:jsonschema.Draft202012Validator.check_schema(json.loads(p.read_text()))
    report={'state':'FAILED' if issues else 'SOURCE_CONTRACTS_PASSED','liveHTTP':False,'actualPostgreSQL':False,
            'javaSourceFiles':java['sourceFiles'],'controllerMappings':len(java['endpoints']),'frontendCallSites':len(front['calls']),
            'resolvedControllerPathVariants':route_matches,'securityHandlers':list(filters),'forwarders':front['forwarders'],
            'recordFieldChecks':body_checks,'opaqueBodyBoundaries':opaque,'javaRecordsInventoried':len(java['records']),
            'schemaTables':schema['tableCount'],'schemaColumns':schema['columnCount'],'migrations':schema['migrations'],
            'jsonSchemaFiles':len(schema_files),'issues':issues}
    (OUT/'contract-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    for name,value in [('java-contracts.json',java),('frontend-contracts.json',front),('schema-inventory.json',schema)]:
        (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k not in ('opaqueBodyBoundaries','recordFieldChecks','forwarders','migrations')},ensure_ascii=False,indent=2))
    if issues:raise SystemExit(1)
if __name__=='__main__':run()
