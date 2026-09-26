import hashlib,importlib.util,tempfile,unittest,warnings,zipfile
from pathlib import Path
S=importlib.util.spec_from_file_location('verify_package_v24',Path(__file__).with_name('verify_package.py'));M=importlib.util.module_from_spec(S);S.loader.exec_module(M)
class PackageTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.path=Path(self.tmp.name)/'release.zip'
 def pack(self,entries=None,manifest=None):
  entries=entries or [('App/a.txt',b'a')]
  if manifest is None:manifest=hashlib.sha256(b'a').hexdigest()+'  a.txt\n'
  with warnings.catch_warnings(),zipfile.ZipFile(self.path,'w') as z:
   warnings.simplefilter('ignore',UserWarning)
   for name,data in entries:z.writestr(name,data)
   z.writestr('App/SHA256SUMS.txt',manifest)
 def test_exact_coverage_and_external_hash(self):
  self.pack();r=M.verify(self.path,M.sha256_file(self.path));self.assertEqual(r['matchedChecksums'],1);self.assertTrue(r['externalDigestChecked'])
 def test_changed_file(self):
  self.pack([('App/a.txt',b'changed')]);self.assertRaisesRegex(M.InvalidPackage,'File SHA-256',M.verify,self.path)
 def test_unlisted_file(self):
  self.pack([('App/a.txt',b'a'),('App/extra',b'x')]);self.assertRaisesRegex(M.InvalidPackage,'coverage',M.verify,self.path)
 def test_missing_file(self):
  self.pack([('App/b.txt',b'a')]);self.assertRaisesRegex(M.InvalidPackage,'coverage',M.verify,self.path)
 def test_duplicate_zip_entry(self):
  self.pack([('App/a.txt',b'a'),('App/a.txt',b'a')]);self.assertRaisesRegex(M.InvalidPackage,'Duplicate archive',M.verify,self.path)
 def test_duplicate_manifest_path(self):
  line=hashlib.sha256(b'a').hexdigest()+'  a.txt\n';self.pack(manifest=line*2);self.assertRaisesRegex(M.InvalidPackage,'Duplicate manifest',M.verify,self.path)
 def test_traversal_rejected_before_extraction(self):
  self.pack([('App/../a.txt',b'a')]);self.assertRaisesRegex(M.InvalidPackage,'Unsafe',M.verify,self.path)
 def test_external_archive_digest_mismatch(self):
  self.pack();self.assertRaisesRegex(M.InvalidPackage,'ZIP SHA-256',M.verify,self.path,'0'*64)
