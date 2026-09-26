#!/usr/bin/env python3
"""Read-only, isolated v10 review reproductions. No network, DB, or source mutation.

Usage: python reproduce_review.py --source /path/to/BoothHana2 --output /tmp/review-results
Requires Java 21, Node, and the TypeScript module used by the supplied source harness.
A zero exit code means the reviewed defect conditions were reproduced, NOT fixed.
"""
from pathlib import Path
import argparse, json, re, subprocess, tempfile

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
a=p.parse_args();root=a.source.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
base=root/'backend/src/main/java/com/boothhana/collection'
original=(base/'CatalogPublicationService.java').read_text()
m=re.search(r'EventData event=new EventData\((raw\.name\(\).*?)\);', original)
if not m:raise SystemExit('Reviewed publisher expression changed. Re-review rather than guess.')
expression='new EventData('+m.group(1)+')'
java='''import java.util.*;
import com.boothhana.collection.CollectionModels.*;
public class PublishStatusReproduction {
  public static void main(String[] args) {
    for(String state:List.of("CANCELED","POSTPONED","RESCHEDULED","SCHEDULED")) {
      EventData raw=new EventData("[TEST] review", "COMIC_DOUJIN", "[TEST] organizer", "1", "SEOUL",
       "test venue", null, "test only", null, List.of(),
       List.of(new Occurrence("2026-10-10","2026-10-10",null,null)),
       List.of(new Source("https://example.com/notice","OFFICIAL","ORIGINAL","test")),
       List.of(),List.of(),"MULTI_BOOTH",List.of(),
       new OperationStatus(state,"Official test notice","https://example.com/notice","2026-09-17"));
      EventData event=EXPRESSION;
      if(!event.operationStatus().state().equals("UNKNOWN") || event.operationStatus().sourceUrl()!=null)
         throw new AssertionError("Behavior no longer matches reviewed defect; inspect new source");
      System.out.printf("%s -> %s; source=%s; note=%s; checkedOn=%s%n",state,event.operationStatus().state(),event.operationStatus().sourceUrl(),event.operationStatus().note(),event.operationStatus().checkedOn());
    }
    System.out.println("REPRODUCED: four explicit operation states and their evidence disappear in the actual publisher constructor expression.");
  }
}
'''.replace('EXPRESSION',expression)
with tempfile.TemporaryDirectory(prefix='boothhana_review_') as tmp:
    tmp=Path(tmp);src=tmp/'PublishStatusReproduction.java';src.write_text(java)
    comp=subprocess.run(['javac','-encoding','UTF-8','-d',str(tmp),str(base/'CollectionModels.java'),str(src)],capture_output=True,text=True,timeout=40)
    (out/'java-compile.log').write_text(comp.stdout+comp.stderr)
    comp.check_returncode()
    result=subprocess.run(['java','-cp',str(tmp),'PublishStatusReproduction'],capture_output=True,text=True,timeout=20)
    (out/'publish-status.log').write_text(result.stdout+result.stderr);result.check_returncode();print(result.stdout)
    (out/'PublishStatusReproduction.java').write_text(java)
node=Path(__file__).with_name('reproduce_ui.cjs')
r=subprocess.run(['node',str(node),str(root)],capture_output=True,text=True,timeout=40)
(out/'ui-reproductions.log').write_text(r.stdout+r.stderr);r.check_returncode();print(r.stdout)
# Review facts from all numbered migration source, not live DB state.
files=sorted((root/'database').glob('[0-9][0-9][0-9]_*.sql'))
tables={}
for f in files:
    for table in re.findall(r'create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z_0-9]*)',f.read_text(),re.I):tables[table]=f.name
base_tables=[k for k,v in tables.items() if v.startswith('001_')]
rls='\n'.join(f.read_text() for f in files)
explicit_rls={t:bool(re.search(r'alter\s+table\s+(?:public\.)?'+re.escape(t)+r'\s+enable\s+row\s+level\s+security',rls,re.I)) for t in base_tables}
handler=(root/'backend/src/main/java/com/boothhana/api/ApiExceptionHandler.java').read_text()
method=handler.split('ResponseEntity<ErrorView> handleUnexpected(Exception exception)')[1].split('\n    }')[0]
report={'scope':'Source inspection only; NOT live schema/grants/API test','migrationFiles':[f.name for f in files], 'tableCount':len(tables),'tables':tables,'baseTableExplicitRls':explicit_rls,'unexpectedHandlerRecordsException':bool(re.search(r'(?:log|logger)\s*\.|printStackTrace|throw\s+exception',method)), 'renderHealthCheck':next(line.strip() for line in (root/'render.yaml').read_text().splitlines() if 'healthCheckPath:' in line)}
(out/'source-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in report.items() if k not in ['tables']},ensure_ascii=False,indent=2))
