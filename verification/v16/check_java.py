from pathlib import Path
import importlib.util,tempfile,subprocess
R=Path(__file__).resolve().parents[2];J=R/'backend/src/main/java'
spec=importlib.util.spec_from_file_location('v12',R/'verification/v12/check_java_contracts.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
STUBS=dict(m.STUBS)
STUBS['jakarta/validation/constraints/Size.java']='package jakarta.validation.constraints;import java.lang.annotation.*;@Target({ElementType.FIELD,ElementType.PARAMETER,ElementType.TYPE_USE,ElementType.RECORD_COMPONENT}) public @interface Size {int min() default 0;int max() default 2147483647;}'
# Only the actual new implementation and minimal boundaries. No application class is stubbed.
keep=[k for k in STUBS if k.startswith(('jakarta/','org/','tools/'))]
with tempfile.TemporaryDirectory(prefix='v15-java-') as t:
 t=Path(t);files=[]
 for k in keep:
  p=t/k;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(STUBS[k]);files.append(p)
 sources=[J/'com/boothhana/api/ApiException.java']+list((J/'com/boothhana/library').glob('*.java'))
 sources=[x for x in sources if x.name not in ('LibraryController.java','LibraryRequestFilter.java')]
 tests=[R/'verification/v15/LibraryRulesTest.java',R/'verification/v15/LibraryServiceTest.java',R/'verification/v16/LibraryBatchTest.java']
 subprocess.run(['javac','-encoding','UTF-8','-d',str(t/'classes'),*map(str,files+sources+tests)],check=True)
 subprocess.run(['java','-cp',str(t/'classes'),'com.boothhana.library.LibraryRulesTest'],check=True)

 subprocess.run(['java','-cp',str(t/'classes'),'com.boothhana.library.LibraryServiceTest'],check=True)

 subprocess.run(['java','-cp',str(t/'classes'),'com.boothhana.library.LibraryBatchTest'],check=True)
