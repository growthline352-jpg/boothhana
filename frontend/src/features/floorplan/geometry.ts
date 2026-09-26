import type { Point, Shape, PlanLink } from './api'
export function normalizeCode(s:string){return s.normalize('NFKC').toUpperCase().replace(/[\s\u00a0]+/g,'').replace(/[\u2010\u2011\u2013]/g,'-')}
export function safePoints(points:Point[]){return Array.isArray(points)&&points.length>=3&&points.length<=16&&points.every(p=>p!=null&&typeof p==='object'&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)}
export function center(points:Point[]):Point{return {x:points.reduce((v,p)=>v+p.x,0)/points.length,y:points.reduce((v,p)=>v+p.y,0)/points.length}}
export function rectangle(id:string,a:Point,b:Point):Shape{return {id,label:'',recognition:'UNCERTAIN',boundaryConfirmed:false,points:[{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y)},{x:Math.max(a.x,b.x),y:Math.min(a.y,b.y)},{x:Math.max(a.x,b.x),y:Math.max(a.y,b.y)},{x:Math.min(a.x,b.x),y:Math.max(a.y,b.y)}]}}
export function dayLinks(links:PlanLink[],day:string){return links.filter(l=>!day||!l.dates.length||l.dates.includes(day))}
