from pathlib import Path
import importlib.util,subprocess,tempfile
R=Path(__file__).resolve().parents[2];J=R/'backend/src/main/java/com/boothhana'
spec=importlib.util.spec_from_file_location('contracts',R/'verification/v12/check_java_contracts.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory(prefix='boothhana-v13-') as tmp:
 tmp=Path(tmp);stubs=[]
 for name,text in m.STUBS.items():
  p=tmp/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text);stubs.append(p)
 actual=['api/ApiException.java','api/ApiModels.java','collection/CollectionModels.java','collection/CatalogModels.java','domain/DomainEnums.java','floorplan/FloorplanModels.java','upload/ImageUploadRules.java','service/ApplicationRules.java','service/ApplicationWorkflowService.java']
 actual+=['support/'+n+'.java' for n in ['SupportModels','SupportRules','SupportComparison','SupportRateLimiter','SupportTargets','SupportService','SupportResolutionService','ExhibitorClaimsService','SupportAttachmentTransactions','SupportAttachments','SupportOperations']]
 subprocess.run(['javac','-encoding','UTF-8','-d',str(tmp/'classes'),*map(str,stubs),*[str(J/a) for a in actual],str(R/'verification/v12/ServiceTest.java'),str(R/'verification/v13/ReliabilityTest.java')],check=True)
 subprocess.run(['java','-cp',str(tmp/'classes'),'com.boothhana.support.ServiceTest'],check=True)
 subprocess.run(['java','-cp',str(tmp/'classes'),'com.boothhana.support.ReliabilityTest'],check=True)
