/** Compile the actual API client and its local runtime dependencies into an isolated ESM graph. */
const fs=require('node:fs'),path=require('node:path'),ts=require('./load_ts.cjs')()
function prepareApiClient(root,directory,base){
 const sourceRoot=path.resolve(root,'frontend/src'),compiled=new Set()
 function compile(file){
  const relative=path.relative(sourceRoot,file)
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('API test dependency outside frontend source')
  const output=path.join(directory,relative.replace(/\.ts$/,'.mjs'))
  if(compiled.has(file))return output
  compiled.add(file)
  const source=fs.readFileSync(file,'utf8').replace('import.meta.env.VITE_API_BASE_URL',JSON.stringify(base))
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText
   .replace(/(\bfrom\s+)(['"])(\.[^'"]+)\2/g,(_match,prefix,quote,name)=>{
    const dependency=path.resolve(path.dirname(file),name+'.ts')
    compile(dependency)
    return prefix+quote+name+'.mjs'+quote
   })
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,js)
  return output
 }
 return compile(path.join(sourceRoot,'api/client.ts'))
}
module.exports={prepareApiClient}
