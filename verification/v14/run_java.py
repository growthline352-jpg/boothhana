from pathlib import Path
import importlib.util,subprocess,tempfile
R=Path(__file__).resolve().parents[2];J=R/'backend/src/main/java/com/boothhana'
spec=importlib.util.spec_from_file_location('contracts',R/'verification/v12/check_java_contracts.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory(prefix='boothhana-v14-') as d:
 t=Path(d);stubs=[]
 for name,text in m.STUBS.items():
  p=t/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text);stubs.append(p)
 actual=['api/ApiException.java','api/ApiModels.java','collection/CollectionModels.java','collection/CatalogModels.java','domain/DomainEnums.java','floorplan/FloorplanModels.java','upload/ImageUploadRules.java','service/ApplicationRules.java','service/ApplicationWorkflowService.java','service/TradeRequestRules.java','service/TradeRequestService.java']
 actual+=['support/'+n+'.java' for n in ['SupportModels','SupportRules','SupportComparison','SupportRateLimiter','SupportTargets','SupportService','SupportResolutionService','ExhibitorClaimsService','SupportAttachmentTransactions','SupportAttachments','SupportOperations']]
 tests=[R/'verification/v12/ServiceTest.java',R/'verification/v13/ReliabilityTest.java',R/'verification/v14/ContentAndAdmissionTest.java',R/'verification/v14/TradeTest.java']
 subprocess.run(['javac','-encoding','UTF-8','-d',str(t/'classes'),*map(str,stubs),*[str(J/x) for x in actual],*map(str,tests)],check=True)
 for test in ['com.boothhana.support.ServiceTest','com.boothhana.support.ReliabilityTest','com.boothhana.support.ContentAndAdmissionTest','com.boothhana.service.TradeTest']:
  subprocess.run(['java','-cp',str(t/'classes'),test],check=True)
