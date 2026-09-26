#!/usr/bin/env python3
"""Actual library service projection against explicit framework/JDBC/JSON boundaries."""
from pathlib import Path
import importlib.util, tempfile, subprocess, os, sys
ROOT=Path(__file__).resolve().parents[2]
SOURCE=Path(os.environ.get('BOOTHHANA_REVIEW_BASELINE',str(ROOT)))
spec=importlib.util.spec_from_file_location('v12_contract_stubs',ROOT/'verification/v12/check_java_contracts.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
stubs={k:v for k,v in module.STUBS.items() if k.startswith(('jakarta/','org/','tools/'))}
stubs['jakarta/validation/constraints/Size.java']='package jakarta.validation.constraints;import java.lang.annotation.*;@Target({ElementType.FIELD,ElementType.PARAMETER,ElementType.TYPE_USE,ElementType.RECORD_COMPONENT}) public @interface Size {int min() default 0;int max() default 2147483647;}'
def main():
 with tempfile.TemporaryDirectory(prefix='boothhana-v21-java-') as folder:
  folder=Path(folder);files=[]
  for name,code in stubs.items():
   p=folder/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(code);files.append(p)
  java=SOURCE/'backend/src/main/java/com/boothhana'
  sources=[java/'api/ApiException.java']+[p for p in (java/'library').glob('*.java') if p.name not in ('LibraryController.java','LibraryRequestFilter.java')]
  tests=[ROOT/'verification/v15/LibraryServiceTest.java',ROOT/'verification/v21/LibraryRevocationTest.java']
  subprocess.run(['javac','-encoding','UTF-8','-d',str(folder/'classes'),*map(str,files+sources+tests)],check=True)
  return subprocess.run(['java','-cp',str(folder/'classes'),'com.boothhana.library.LibraryRevocationTest']).returncode
if __name__=='__main__':sys.exit(main())
