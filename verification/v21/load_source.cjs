// Actual TypeScript modules; external dependencies must be supplied explicitly.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../v4/load_ts.cjs')();
const root=process.env.BOOTHHANA_REVIEW_BASELINE||path.resolve(__dirname,'../..');
exports.loadSource=function(relative,overrides={}) {
 const modules=new Map();
 function load(file){if(modules.has(file))return modules.get(file).exports;
  const module={exports:{}};modules.set(file,module);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8').replace(/\bimport\.meta\.env\b/g,'({})'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const required=name=>{if(Object.hasOwn(overrides,name))return overrides[name];if(!name.startsWith('.'))return require(name);let f=path.resolve(path.dirname(file),name);if(!fs.existsSync(f))f+=fs.existsSync(f+'.ts')?'.ts':'.tsx';return load(f)};
  vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(required,module,module.exports);return module.exports;
 }
 return load(path.resolve(root,relative));
};
exports.wait=function(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
