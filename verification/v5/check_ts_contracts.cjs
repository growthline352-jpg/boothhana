// Type-check local catalog contracts with minimal external declarations. Not a full React build.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const ts=require('../v4/load_ts.cjs')(),root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-types-'))
try {
 const declarations=path.join(temp,'externals.d.ts')
 fs.writeFileSync(declarations,`
declare module '*.css' {}
// New UI reuses the already-declared runtime qrcode dependency; explicit external test stub.
declare module 'qrcode' {const QRCode:{toDataURL:(value:string,options?:any)=>Promise<string>};export default QRCode;}
interface ImportMeta {env:{VITE_API_BASE_URL?:string}}
declare module 'react' { export function useId():string; export interface Context<T>{Provider:any;__type?:T} export function createContext<T>(value:T):Context<T>;export function useContext<T>(ctx:Context<T>):T; 
 export interface PointerEvent<T>{button:number;clientX:number;clientY:number;pointerId:number;target:EventTarget;currentTarget:T;preventDefault():void;}
 export type ReactNode=unknown; export interface FormEvent {preventDefault():void;}
 export type SetStateAction<T>=T|((prev:T)=>T);
 export type Dispatch<T>=(value:T)=>void;
 export function useState<T>(initial:T|(()=>T)):[T,Dispatch<SetStateAction<T>>];
 export function useMemo<T>(factory:()=>T,deps:readonly unknown[]):T;
 export function useCallback<T extends (...args:any[])=>any>(fn:T,deps:readonly unknown[]):T;
 export function useEffect(fn:()=>void|(()=>void),deps?:readonly unknown[]):void;
 export function useLayoutEffect(fn:()=>void|(()=>void),deps?:readonly unknown[]):void;
 export function useRef<T>(initial:T):{current:T};export function useRef<T>(initial:T|null):{current:T|null};
}
declare module 'react/jsx-runtime' {
 export namespace JSX {interface Element {} interface ElementChildrenAttribute {children:{}} interface IntrinsicAttributes {key?:string|number} interface IntrinsicElements {[name:string]:any}}
 export function jsx(...args:any[]):JSX.Element; export function jsxs(...args:any[]):JSX.Element;export const Fragment:any;
}
declare module 'react-router' {export function useNavigate():(to:string|number,options?:any)=>void;export function useNavigationType():'POP'|'PUSH'|'REPLACE';export function useBlocker(when:boolean):{state:'unblocked'}|{state:'blocked';proceed():void;reset():void};export const Link:(props:any)=>import('react/jsx-runtime').JSX.Element; export function useParams():Record<string,string|undefined>; export function useLocation():{pathname:string;search:string;state:unknown}; export function useSearchParams():[URLSearchParams,(value:URLSearchParams|Record<string,string>,options?:any)=>void];}
`)
 const folder=path.join(root,'frontend/src/features/catalog'),files=fs.readdirSync(folder).filter(n=>/\.tsx?$/.test(n)).map(n=>path.join(folder,n))
 const options={target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,noEmit:true,skipLibCheck:true,strictNullChecks:true,noUnusedLocals:true,noUnusedParameters:true,allowArbitraryExtensions:true}
 const program=ts.createProgram([...files,declarations],options)
 const diagnostics=ts.getPreEmitDiagnostics(program)
 if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:n=>n,getNewLine:()=>"\n"}));process.exitCode=1}
 else console.log('PASS: catalog local TS contracts with minimal React/router/Vite declarations. Real dependency compatibility NOT checked.')
} finally {fs.rmSync(temp,{recursive:true,force:true})}
