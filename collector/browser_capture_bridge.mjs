// Run through the desktop CUA REPL, never through an alternate browser driver.
// Only public post DOM is exported. Browser cookies, headers, login fields and
// unrelated page/account state are deliberately outside the capture contract.
import * as fs from 'node:fs/promises';
import path from 'node:path';

export async function fulfillPending({cua,tab,directory,domSource,maxRequests=10}) {
  const files=(await fs.readdir(directory)).filter(n=>/^[0-9a-f-]{36}\.request\.json$/.test(n));
  const done=[];
  for(const file of files) {
    if(done.length>=maxRequests)break;
    const request=JSON.parse(await fs.readFile(path.join(directory,file),'utf8'));
    if(file!==request.id+'.request.json')continue;
    const requestedAt=Date.parse(request.requestedAt),expiresAt=request.expiresAt?Date.parse(request.expiresAt):requestedAt+180000;
    if(request.state!=='PENDING'||!Number.isFinite(requestedAt)||!Number.isFinite(expiresAt)||requestedAt>Date.now()||Date.now()>expiresAt)continue;
    if(!/^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}(?:\/status\/[0-9]{1,25})?$/.test(request.url))continue;
    const destination=path.join(directory,request.id+'.response.json');
    try {await fs.access(destination);continue;}catch(error){if(error.code!=='ENOENT')throw error;}
    await tab.goto(request.url);
    await tab.getAXState({emit:false});
    // A navigation snapshot can precede the public timeline render.
    try {await tab.playwright.locator('article').first().waitFor({state:'visible',timeoutMs:10000});}catch(error){}
    // These are only the public post-text expand controls. No menus or login.
    const controls=await tab.playwright.locator('[data-testid="tweet-text-show-more-link"], article div.whitespace-pre-wrap[dir="auto"] button').all();
    // Clicking removes an expand control. Work backwards so nth locators for
    // the earlier posts remain valid as the collection shrinks.
    for(const control of controls.slice(0,20).reverse())await control.click();
    if(controls.length)await tab.getAXState({emit:false});
    const snapshot=await tab.playwright.evaluate('('+domSource+')()');
    const response={id:request.id,requestedUrl:request.url,capturedAt:new Date().toISOString().replace('Z','+00:00'),snapshot};
    const temporary=destination+'.tmp';
    await fs.writeFile(temporary,JSON.stringify(response));
    await fs.rename(temporary,destination);
    done.push({url:request.url,posts:snapshot.posts?.length||0,images:snapshot.posts?.reduce((sum,p)=>sum+p.images.length,0)||0});
  }
  return done;
}
