from pathlib import Path
import tempfile,subprocess
ROOT=Path(__file__).resolve().parents[2];src=ROOT/'backend/src/main/java/com/boothhana/collection'
with tempfile.TemporaryDirectory() as td:
 files=[src/x for x in ['CollectionModels.java','CollectionRules.java','VisitorGuideRules.java','CatalogTaxonomy.java','CatalogBrowseQuery.java','CatalogModels.java']]
 files += [src.parent/'interests'/x for x in ['TaxonomyRegistry.java','TaxonomyRegistryData.java']]
 files += [ROOT/'verification/v18/CatalogScopeTest.java',ROOT/'verification/v6/BrowseRulesTest.java']
 subprocess.run(['javac','-encoding','UTF-8','-d',td,*map(str,files)],check=True)
 for name in ['CatalogScopeTest','BrowseRulesTest']:subprocess.run(['java','-cp',td,name],check=True)

# Full Java syntax includes controllers, health contract and opt-in integration tests.
with tempfile.TemporaryDirectory() as td:
 subprocess.run(['javac','-encoding','UTF-8','-d',td,str(ROOT/'verification/v4/JavaSyntaxCheck.java')],check=True)
 subprocess.run(['java','-cp',td,'JavaSyntaxCheck',*map(str,sorted((ROOT/'backend/src').rglob('*.java')))],check=True)
