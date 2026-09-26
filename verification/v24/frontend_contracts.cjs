/** TypeScript compiler AST: inventories source contracts, not browser/HTTP execution. */
const fs=require('node:fs'),path=require('node:path'),ts=require('../v4/load_ts.cjs')()
const root=path.resolve(process.env.BOOTHHANA_REVIEW_BASELINE||process.argv[2]||path.resolve(__dirname,'../..'))
const files=[];function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())walk(f);else if(/\.tsx?$/.test(f))files.push(f)}}walk(path.join(root,'frontend/src'))
const calls=[],interfaces=[],forwarders=[]
for(const file of files){
 const sf=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),defs=new Map()
 function collect(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer)defs.set(n.name.text,n.initializer);ts.forEachChild(n,collect)}collect(sf)
 const name=n=>n?.name?.getText(sf)?.replace(/^['"]|['"]$/g,'')
 function evaluate(n,env={},seen=new Set()){
  if(!n)return [''];if(ts.isStringLiteralLike(n))return[n.text]
  if(ts.isParenthesizedExpression(n))return evaluate(n.expression,env,seen)
  if(n.kind===ts.SyntaxKind.TrueKeyword)return[true];if(n.kind===ts.SyntaxKind.FalseKeyword)return[false]
  if(ts.isIdentifier(n)){
   if(n.text==='API_BASE_URL')return [''];if(Object.hasOwn(env,n.text))return env[n.text]
   if(!seen.has(n.text)&&defs.has(n.text)){const next=new Set(seen);next.add(n.text);const value=defs.get(n.text);if(!ts.isArrowFunction(value))return evaluate(value,env,next)}
   return ['{value}']
  }
  if(ts.isTemplateExpression(n)){let out=[n.head.text];for(const s of n.templateSpans)out=out.flatMap(a=>evaluate(s.expression,env,seen).map(b=>a+b+s.literal.text));return out}
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken)return evaluate(n.left,env,seen).flatMap(a=>evaluate(n.right,env,seen).map(b=>a+b))
  if(ts.isConditionalExpression(n)){const c=evaluate(n.condition,env,seen);return c.length===1&&c[0]===true?evaluate(n.whenTrue,env,seen):c.length===1&&c[0]===false?evaluate(n.whenFalse,env,seen):[...evaluate(n.whenTrue,env,seen),...evaluate(n.whenFalse,env,seen)]}
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&defs.has(n.expression.text)){
   const fn=defs.get(n.expression.text)
   if(ts.isArrowFunction(fn)&&!ts.isBlock(fn.body)){const next={...env};fn.parameters.forEach((p,i)=>next[p.name.getText(sf)]=evaluate(n.arguments[i]||p.initializer,env,seen));return evaluate(fn.body,next,seen)}
  }
  return ['{value}']
 }
 function objectBody(n,seen=new Set()){
  if(!n)return null
  if(ts.isParenthesizedExpression(n))return objectBody(n.expression,seen)
  if(ts.isObjectLiteralExpression(n))return n
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&!seen.has(n.expression.text)){
   const fn=defs.get(n.expression.text);if(fn&&ts.isArrowFunction(fn)){const next=new Set(seen);next.add(n.expression.text);return objectBody(fn.body,next)}
  }
  return null
 }
 function visit(n){
  if(ts.isInterfaceDeclaration(n))interfaces.push({name:n.name.text,file:path.relative(root,file),extends:(n.heritageClauses||[]).flatMap(h=>h.types.map(t=>t.expression.getText(sf))),fields:n.members.filter(ts.isPropertySignature).map(m=>({name:name(m),type:m.type?.getText(sf)||'',optional:!!m.questionToken}))})
  if(ts.isCallExpression(n)&&['api','post','request','fetch'].includes(n.expression.getText(sf))){
   const callee=n.expression.getText(sf),arg=n.arguments[1],props=arg&&ts.isObjectLiteralExpression(arg)?arg.properties:[]
   let method=callee==='post'?'POST':'GET';const mp=props.find(p=>name(p)==='method');if(mp&&ts.isPropertyAssignment(mp))method=mp.initializer.text||'UNKNOWN'
   const paths=[...new Set(evaluate(n.arguments[0]))];const line=sf.getLineAndCharacterOfPosition(n.getStart()).line+1
   let bodyFields=null;const bp=props.find(p=>name(p)==='body');if(bp&&ts.isPropertyAssignment(bp)&&ts.isCallExpression(bp.initializer)&&bp.initializer.expression.getText(sf)==='JSON.stringify') {const body=objectBody(bp.initializer.arguments[0]);if(body)bodyFields=body.properties.map(name)}
   const item={file:path.relative(root,file),line,callee,method,paths,bodyFields,expression:n.arguments[0]?.getText(sf)}
   if(paths.some(p=>typeof p==='string'&&p.startsWith('/api/')))calls.push(item);else if(['api','post','request'].includes(callee))forwarders.push(item)
  }
  ts.forEachChild(n,visit)
 }
 visit(sf)
}
console.log(JSON.stringify({files:files.length,calls,interfaces,forwarders},null,2))
