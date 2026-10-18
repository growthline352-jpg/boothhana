import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fulfillPending} from '../browser_capture_bridge.mjs';

test('all public expand controls are read despite shrinking live nth locators',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'boothhana-browser-'));
 try {
  const id='12345678-1234-1234-1234-123456789abc',url='https://x.com/artist';
  await fs.writeFile(path.join(directory,id+'.request.json'),JSON.stringify({id,url,state:'PENDING',requestedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()}));
  const buttons=[0,1,2],clicked=[];
  const controls=buttons.map((_,i)=>({click:async()=>{assert.ok(i<buttons.length,'stale live nth locator');clicked.push(buttons[i]);buttons.splice(i,1);}}));
  const tab={goto:async u=>assert.equal(u,url),getAXState:async()=>{},playwright:{locator:()=>({first:()=>({waitFor:async()=>{}}),all:async()=>controls}),evaluate:async()=>({url,anonymous:true,posts:[]})}};
  await fulfillPending({tab,directory,domSource:'() => ({})'});
  assert.deepEqual(clicked,[2,1,0]);assert.deepEqual(buttons,[]);
  const response=JSON.parse(await fs.readFile(path.join(directory,id+'.response.json'),'utf8'));
  assert.equal(response.id,id);assert.equal(response.requestedUrl,url);
 }finally{
  const absolute=path.resolve(directory),root=path.resolve(os.tmpdir())+path.sep;
  assert.ok(absolute.startsWith(root)&&path.basename(absolute).startsWith('boothhana-browser-'));
  await fs.rm(absolute,{recursive:true,force:true});
 }
});
