from pathlib import Path
import argparse,importlib.util,subprocess,tempfile
p=argparse.ArgumentParser(description='Reproduce timestamp-only correction in unmodified v13. No DB/network.')
p.add_argument('source',type=Path);a=p.parse_args();root=a.source.resolve();here=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('contracts',root/'verification/v12/check_java_contracts.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
actual=['api/ApiException.java','api/ApiModels.java','collection/CollectionModels.java','collection/CatalogModels.java','domain/DomainEnums.java','floorplan/FloorplanModels.java','upload/ImageUploadRules.java','service/ApplicationRules.java','service/ApplicationWorkflowService.java']
actual+=['support/'+n+'.java' for n in ['SupportModels','SupportRules','SupportComparison','SupportRateLimiter','SupportTargets','SupportService','SupportResolutionService','ExhibitorClaimsService','SupportAttachmentTransactions','SupportAttachments','SupportOperations']]
with tempfile.TemporaryDirectory(prefix='boothhana-release-review-') as t:
 t=Path(t);stubs=[]
 for name,text in m.STUBS.items():
  f=t/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(text);stubs.append(f)
 subprocess.run(['javac','-encoding','UTF-8','-d',str(t/'classes'),*map(str,stubs),*[str(root/'backend/src/main/java/com/boothhana'/x) for x in actual],str(root/'verification/v12/ServiceTest.java'),str(here/'ReleaseReviewTest.java')],check=True)
 subprocess.run(['java','-cp',str(t/'classes'),'com.boothhana.support.ReleaseReviewTest'],check=True)
