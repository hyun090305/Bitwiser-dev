import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const root=path.resolve('.');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif','.mp3':'audio/mpeg','.wav':'audio/wav'};
const server=createServer(async(req,res)=>{
  try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(body);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({locale:'en-US'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>document.getElementById('loadingStartBtn')?.disabled===false,{},{timeout:25000});
  assert.equal(await page.locator('#storyHudBtn, #storyPlaybackOverlay, #storyModalOverlay').count(),0);
  const result=await page.evaluate(async()=>({stages:Object.keys((await import('./src/modules/levels.js')).getLevelTitles()).length,hasLegacyAccount:!!document.getElementById('googleLoginBtn'),hasLegacyLabNode:(await(await fetch('stage_map.json')).json()).nodes.some(n=>n.id==='lab')}));
  assert.equal(result.stages,47);assert.ok(result.hasLegacyAccount);assert.ok(result.hasLegacyLabNode);assert.deepEqual(errors,[]);
  const guards=await page.evaluate(async()=>{
    const levels=await import('./src/modules/levels.js');
    const checks=[];
    for(const [id,cleared] of [[25,[]],[25,[6]],[9,[9]],[12,[30]],[12,[30,11]],[34,[30]],[35,[30,31]],[32,[30,31]]]) {
      levels.configureLevelModule({progressProvider:()=>cleared});
      try {await levels.startLevel(id);checks.push(true);}catch{checks.push(false);}
    }
    return checks;
  });
  assert.deepEqual(guards,[false,true,true,false,false,false,true,false]);
  console.log(JSON.stringify({...result,errors}));
}catch(error){console.error(error,errors);process.exitCode=1;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
