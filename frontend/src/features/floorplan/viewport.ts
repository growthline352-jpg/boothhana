import type {Point} from './api'
export const clampZoom=(zoom:number)=>Math.max(1,Math.min(12,Number.isFinite(zoom)?zoom:1))
/** Anchor a normalized source point at the requested viewport point after scaling. */
export function anchoredScroll(point:Point,zoom:number,baseWidth:number,ratio:number,anchor:Point) {
  const width=baseWidth*clampZoom(zoom),height=width/Math.max(.00001,ratio)
  return {left:Math.max(0,point.x*width-anchor.x),top:Math.max(0,point.y*height-anchor.y)}
}
export function fitShapeZoom(points:Point[],baseWidth:number,ratio:number,viewHeight:number) {
  const spanX=Math.max(.005,Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)))
  const spanY=Math.max(.005,Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)))
  return clampZoom(Math.min(7,Math.max(2,Math.min(100/(baseWidth*spanX),100/(baseWidth/ratio*spanY),viewHeight/(baseWidth/ratio*spanY*2)))))
}
