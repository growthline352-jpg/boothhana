"""Extract this repository's explicit CREATE/ALTER column DDL (not execute PostgreSQL).
Unsupported column definitions fail instead of disappearing from coverage.
Dynamic permission/RLS SQL and NOT VALID constraint validation remain real-DB checks.
"""
from pathlib import Path
import json,re,os
ROOT=Path(os.environ.get('BOOTHHANA_REVIEW_BASELINE',Path(__file__).resolve().parents[2]))
TYPES={'bigserial':'int8','bigint':'int8','integer':'int4','int':'int4','boolean':'bool','text':'text','uuid':'uuid','jsonb':'jsonb','timestamptz':'timestamptz','date':'date','varchar':'varchar','char':'bpchar','bytea':'bytea','double precision':'float8'}
def pieces(text):
    out=[];start=0;depth=0;quote=False;i=0
    while i<len(text):
        c=text[i]
        if c=="'":
            if quote and i+1<len(text) and text[i+1]=="'":i+=2;continue
            quote=not quote
        if not quote:
            if c=='(':depth+=1
            elif c==')':depth-=1
            elif c==',' and depth==0:out.append(text[start:i].strip());start=i+1
        i+=1
    out.append(text[start:].strip());return out

def close_paren(text,start):
    depth=1;quote=False;i=start
    while i<len(text):
        c=text[i]
        if c=="'":
            if quote and i+1<len(text) and text[i+1]=="'":i+=2;continue
            quote=not quote
        if not quote:
            if c=='(':depth+=1
            elif c==')':
                depth-=1
                if depth==0:return i
        i+=1
    raise ValueError('Unterminated table definition')

def column(part):
    m=re.match(r'(\w+)\s+(bigserial|bigint|integer|int|boolean|text|uuid|jsonb|timestamptz|date|varchar|char|bytea|double precision)\b(?:\s*\(\s*(\d+)\s*\))?',part,re.I)
    if not m:raise ValueError('Unsupported column DDL: '+part)
    name,typ,size=m.groups();return name.lower(),{'udt':TYPES[typ.lower()],'length':int(size) if size else None,'notNull':bool(re.search(r'\bnot\s+null\b|\bprimary\s+key\b',part,re.I)),'definition':part}

def inventory(root=ROOT):
    tables={};files=sorted((root/'database').glob('[0-9][0-9][0-9]_*.sql'))
    if [p.name[:3] for p in files]!=[f'{i:03d}' for i in range(1,38)]:raise ValueError('Expected migration sequence 001..037')
    for path in files:
        text=re.sub(r'/\*.*?\*/','',path.read_text(),flags=re.S);text=re.sub(r'--[^\n]*','',text)
        # This extractor intentionally supports only CREATE and single ADD/DROP COLUMN.
        # Never let a future type/nullability/rename migration disappear from coverage.
        nullable=r'alter\s+table\s+(?:public\.)?(\w+)\s+alter\s+column\s+(\w+)\s+(drop|set)\s+not\s+null\s*;'
        other=re.sub(nullable,'',text,flags=re.I)
        if re.search(r'\balter\s+table\b[^;]*\b(?:alter\s+(?:column\s+)?\w+|rename\s+(?:column\s+)?\w+)\b|\bdrop\s+table\b',other,re.I):
            raise ValueError('Unsupported ALTER/RENAME/DROP TABLE requires explicit schema audit support: '+path.name)
        for statement in re.findall(r'\balter\s+table\b[^;]*\badd\s+column\b[^;]*',text,re.I):
            if re.search(r',\s*(?:add|drop|alter|rename)\b',statement,re.I):
                raise ValueError('Multi-action column DDL requires explicit schema audit support: '+path.name)
        actions=[]
        for m in re.finditer(nullable,text,re.I):actions.append((m.start(),'nullable',m.group(1),(m.group(2),m.group(3).lower()=='set')))
        for m in re.finditer(r'create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(',text,re.I):
            body=text[m.end():close_paren(text,m.end())];actions.append((m.start(),'create',m.group(1),body))
        for m in re.finditer(r'alter\s+table\s+(?:public\.)?(\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([^;]+)',text,re.I):actions.append((m.start(),'add',m.group(1),m.group(2)))
        for m in re.finditer(r'alter\s+table\s+(?:public\.)?(\w+)\s+drop\s+column\s+(?:if\s+exists\s+)?(\w+)',text,re.I):actions.append((m.start(),'drop',m.group(1),m.group(2)))
        for _,kind,table,body in sorted(actions):
            if kind=='create':
                fields={};primary=[]
                for part in pieces(body):
                    if re.match(r'(constraint|primary|unique|check|foreign)\b',part,re.I):
                        p=re.search(r'primary\s+key\s*\(([^)]+)\)',part,re.I)
                        if p:primary.extend(c.strip() for c in p.group(1).split(','))
                        continue
                    n,c=column(part);fields[n]=c
                for n in primary:fields[n]['notNull']=True
                tables[table]=fields
            elif kind=='add':
                n,c=column(body);tables[table][n]=c
            elif kind=='nullable':tables[table][body[0]]['notNull']=body[1]
            else:tables[table].pop(body,None)
    health=(root/'backend/src/main/java/com/boothhana/health/SchemaContract.java').read_text()
    declared={m.group(1):re.findall(r'"([a-z0-9_]+)"',m.group(2)) for m in re.finditer(r'Map.entry\("(\w+)",List.of\((.*?)\)\)',health)}
    issues=[]
    for t in sorted(set(tables)|set(declared)):
        if set(tables.get(t,{}))!=set(declared.get(t,[])):issues.append({'table':t,'ddlOnly':sorted(set(tables.get(t,{}))-set(declared.get(t,[]))),'contractOnly':sorted(set(declared.get(t,[]))-set(tables.get(t,{})))})
    return {'migrations':[p.name for p in files],'tableCount':len(tables),'columnCount':sum(map(len,tables.values())),'tables':tables,'readinessColumnsMismatch':issues}
if __name__=='__main__':print(json.dumps(inventory(),ensure_ascii=False,indent=2))
