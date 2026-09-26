"""Sample solid-background visible text. Gradients/transparency omitted; not a WCAG certification."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import re,json
R=Path(__file__).resolve().parents[2]
def rgb(x):
 vals=re.findall(r'[\d.]+',x);return list(map(float,vals))
def lum(c):
 a=[x/255 for x in c[:3]];return sum(w*(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4) for x,w in zip(a,[.2126,.7152,.0722]))
seen=set();out=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for name in ['home','booths','drawer','admin','creator','exhibitions','festivals']:
  page=b.new_page(viewport={'width':390,'height':844});page.route('**/*',lambda r:r.abort())
  page.set_content((R/f'preview/v10/{name}.html').read_text())
  data=page.locator('body').evaluate('''() => [...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length&&!e.closest('.preview-bar,svg,button:disabled')&&getComputedStyle(e).visibility!='hidden'&&[...e.childNodes].some(t=>t.nodeType===3&&t.textContent.trim())).map(e=>{let p=e,bg='rgb(255, 255, 255)',gradient=false;while(p){let s=getComputedStyle(p);if(s.backgroundImage!='none')gradient=true;if(s.backgroundColor!='rgba(0, 0, 0, 0)'&&s.backgroundColor!='transparent'){bg=s.backgroundColor;break}p=p.parentElement}const s=getComputedStyle(e);return {text:e.textContent.trim().slice(0,45),cls:e.className,tag:e.tagName,color:s.color,bg,gradient,size:parseFloat(s.fontSize),weight:parseInt(s.fontWeight)}})''')
  for e in data:
   if e['gradient']:continue
   a,c=rgb(e['color']),rgb(e['bg'])
   if len(c)>3 and c[3]<1:continue
   ratio=(max(lum(a),lum(c))+.05)/(min(lum(a),lum(c))+.05)
   limit=3 if e['size']>=24 or e['size']>=18.66 and e['weight']>=700 else 4.5
   if ratio<limit and (e['color'],e['bg'],e['cls']) not in seen:
    seen.add((e['color'],e['bg'],e['cls']));out.append({'page':name,'ratio':round(ratio,2),**e})
  page.close()
 b.close()
print(json.dumps(out,ensure_ascii=False,indent=2))
