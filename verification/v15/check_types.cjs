/* v12 support and existing task UI local type contracts; external React/Router definitions are explicit stubs. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const ts=require('../v4/load_ts.cjs')(),root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'v6-types-'))
try{
 const declarations=path.join(temp,'externals.d.ts')
 fs.writeFileSync(declarations,`
declare namespace React { type ReactNode=unknown; }
declare module 'qrcode' {const QRCode:{toDataURL:(value:string,options?:any)=>Promise<string>};export default QRCode;}
declare module '*.css' {} interface ImportMeta{env:{VITE_API_BASE_URL?:string;VITE_PUBLIC_SITE_URL?:string}}
declare module 'react'{ export function useId():string; export function useSyncExternalStore<T>(subscribe:(listener:()=>void)=>()=>void,getSnapshot:()=>T,getServerSnapshot?:()=>T):T; 
 export type ReactNode=unknown;export type SetStateAction<T>=T|((prev:T)=>T);export type Dispatch<T>=(value:T)=>void;
 export interface PointerEvent<T>{button:number;clientX:number;clientY:number;pointerId:number;target:EventTarget;currentTarget:T;preventDefault():void;}
 export interface FormEvent{preventDefault():void;} export interface Context<T>{Provider:any;__type?:T}
 export function createContext<T>(value:T):Context<T>;export function useContext<T>(ctx:Context<T>):T;
 export function useState<T>(initial:T|(()=>T)):[T,Dispatch<SetStateAction<T>>];
 export function useMemo<T>(fn:()=>T,deps:readonly unknown[]):T;export function useCallback<T extends (...args:any[])=>any>(fn:T,deps:readonly unknown[]):T;
 export function useEffect(fn:()=>void|(()=>void),deps?:readonly unknown[]):void;export function useLayoutEffect(fn:()=>void|(()=>void),deps?:readonly unknown[]):void;
 export function useRef<T>(initial:T):{current:T};export function useRef<T>(initial:T|null):{current:T|null};
}
declare module 'react/jsx-runtime'{export namespace JSX{interface Element{} interface ElementChildrenAttribute{children:{}}interface IntrinsicAttributes{key?:string|number}interface IntrinsicElements{[name:string]:any}} export function jsx(...args:any[]):JSX.Element;export function jsxs(...args:any[]):JSX.Element;export const Fragment:any;}
declare module 'react-router'{export function useNavigate():(to:string|number,options?:any)=>void;export function useNavigationType():'POP'|'PUSH'|'REPLACE';export function useBlocker(when:boolean):{state:'unblocked'}|{state:'blocked';proceed():void;reset():void};export const Link:(props:any)=>import('react/jsx-runtime').JSX.Element;export const NavLink:typeof Link;export const Outlet:typeof Link;export function useParams():Record<string,string|undefined>;export function useLocation():{pathname:string;search:string;state:unknown};export function useSearchParams():[URLSearchParams,(v:URLSearchParams|Record<string,string>,options?:any)=>void];}
`)
 const sources=['frontend/src/features/catalog/CatalogAdminPage.tsx','frontend/src/app/AuthContext.tsx','frontend/src/features/library/LibraryPage.tsx','frontend/src/features/library/LibraryProvider.tsx','frontend/src/features/library/ShareQr.tsx','frontend/src/features/library/SaveButton.tsx','frontend/src/pages/ReservationPages.tsx','frontend/src/features/support/SupportPages.tsx','frontend/src/features/support/GuestSupportPage.tsx','frontend/src/features/support/AdminSupportPages.tsx','frontend/src/features/support/SupportBoundary.tsx','frontend/src/pages/AdminPages.tsx','frontend/src/features/goods/GoodsAdminPage.tsx','frontend/src/components/layout/ConsoleLayout.tsx','frontend/src/pages/CreatorPages.tsx','frontend/src/features/floorplan/FloorplanAdmin.tsx','frontend/src/components/layout/PublicLayout.tsx','frontend/src/pages/HomePage.tsx','frontend/src/features/discovery/DiscoveryPage.tsx','frontend/src/features/discovery/browse.ts','frontend/src/features/discovery/categories.ts','frontend/src/features/catalog/CatalogPublicPage.tsx','frontend/src/features/catalog/BannerSelectionPanel.tsx'].map(p=>path.join(root,p))
 const program=ts.createProgram([...sources,declarations],{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,noEmit:true,skipLibCheck:true,strictNullChecks:true,noUnusedLocals:true,noUnusedParameters:true,allowArbitraryExtensions:true,erasableSyntaxOnly:true,verbatimModuleSyntax:true})
 const errors=ts.getPreEmitDiagnostics(program)
 if(errors.length){console.error(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>root,getCanonicalFileName:n=>n,getNewLine:()=>"\n"}));process.exitCode=1}
 else console.log('PASS: v15 library plus existing public/task local TS contracts; React/Router external STUBS.')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
