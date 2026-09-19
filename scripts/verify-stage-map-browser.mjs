import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { STAGES } from '../src/modules/stageCatalog.js';

const root=path.resolve('.'), out=path.join(root,'test-results/stage-map');
await fs.mkdir(out,{recursive:true});
// Use the real page markup and renderer with local progress, independent of Firebase availability.
const source=(await fs.readFile('index.html','utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const fullEntrySource=await fs.readFile('src/main.js','utf8');
const fullCircuitKeyHandler=fullEntrySource.match(/document\.addEventListener\('keydown', e => \{[\s\S]*?\r?\n\}\);/)?.[0];
assert.ok(fullCircuitKeyHandler,'Full entry circuit key handler must be included in the map regression test');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.gif':'image/gif'};
const server=createServer(async(req,res)=>{
  try {
    const name=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+name);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    if(name==='/map-test.html'){res.writeHead(200,{'Content-Type':'text/html'}).end(source);return;}
    let body=await fs.readFile(file);
    // Observe the actual render model/camera without adding testing hooks to the product.
    if(name==='/src/modules/stageMap.js')body=body.toString().replace(/  return \{\s+refresh: \(\) => \{/, '  return {\n    state, camera,\n    refresh: () => {');
    if(name==='/src/modules/labMode.js')body=body.toString()+'\nexport function labCameraForTest() { return labCamera.getState(); }\n';
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(body);
  } catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true,serviceWorkers:'block'}),errors=[];
const input=await page.context().newCDPSession(page);
async function pinch(startDistance,endDistance) {
  const touches=distance=>[{id:1,x:800-distance/2,y:450},{id:2,x:800+distance/2,y:450}];
  await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches(startDistance)});
  for(let step=1;step<=5;step++) {
    await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(startDistance+(endDistance-startDistance)*step/5)});
  }
  await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(100);
}
async function swipe(fingers) {
  const touches=step=>Array.from({length:fingers},(_,id)=>({id:id+1,x:700+id*160+step*20,y:450+step*8}));
  await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches(0)});
  for(let step=1;step<=5;step++) await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(step)});
  await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(100);
}
await page.addInitScript(()=>{
  window.mapTextSamples={};
  const original=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
    if(this.canvas.id==='stageMapCanvas') {
      const matrix=this.getTransform(), cssScale=this.canvas.clientWidth/this.canvas.width;
      window.mapTextSamples[text]={fontSize:Number(this.font.match(/([\d.]+)px/)?.[1])*Math.hypot(matrix.a,matrix.b)*cssScale,
        align:this.textAlign,x,y};
    }
    return original.call(this,text,x,y,...rest);
  };
});
page.on('pageerror',e=>errors.push(e.message));
const url=`http://127.0.0.1:${server.address().port}/map-test.html`;
async function setProgress(cleared=[],access={}) {
  await page.evaluate(async({cleared,access})=>{
    window.testCleared=cleared;window.testAccess=access;
    await (await import('./src/modules/levels.js')).loadClearedLevelsFromDb();
    window.mapTest.refresh();
  },{cleared,access});
}
async function chapter(number) {
  await page.evaluate(n=>window.mapTest.focusChapter(`chapter_${n}`,{animate:false}),number);
  await page.waitForTimeout(150);
}
async function geometry() {
  return page.evaluate(()=>{
    const {state,camera}=window.mapTest;
    return {scale:camera.getScale(),chapter:state.currentChapterId,nodes:state.nodes.filter(n=>n.gridPosition).map(n=>({id:n.id,chapterId:n.chapterId,rect:n.rect,center:n.center,status:state.nodeStatus.get(n.id),screen:camera.worldToScreen(n.center.x,n.center.y)})),
      edges:state.edges.map(e=>({from:e.from,to:e.to,points:e.points})),camera:camera.getState()};
  });
}
try {
  await page.goto(url);
  await page.evaluate(async handler=>{
    const {isTextInputFocused}=await import('./src/modules/gameUI.js');
    window.keyboardCircuitMoves=[];
    // Register the real full-entry handler before the map, as src/main.js does.
    new Function('isTextInputFocused','moveCircuit','getActiveCustomProblem','gameScreen','stageMapScreen',handler)(
      isTextInputFocused,(...move)=>window.keyboardCircuitMoves.push(move),()=>null,
      document.getElementById('gameScreen'),document.getElementById('stageMapScreen'));
  },fullCircuitKeyHandler);
  await page.evaluate(async()=>{
    window.currentLang='ko'; window.t=key=>({stageMapChapterLabelPrefix:'챕터',stageMapChapterPrev:'이전',stageMapChapterNext:'다음'}[key]||key);
    document.getElementById('loadingScreen')?.remove();
    document.querySelectorAll('.screen,.modal').forEach(el=>el.style.display='none');
    const levels=await import('./src/modules/levels.js');
    await levels.loadStageData('ko');
    window.testCleared=[];window.testAccess={};window.mapFeatureGates=[];
    levels.configureLevelModule({progressProvider:()=>window.testCleared,accessProvider:()=>window.testAccess});
    window.mapTest=(await import('./src/modules/stageMap.js')).initializeStageMap({getLevelTitle:levels.getLevelTitle,getClearedLevels:()=>window.testCleared,
      getStageAccess:()=>window.testAccess,isLevelUnlocked:levels.isLevelUnlocked,startLevel:levels.startLevel,onlineFeatures:false,
      getStageStars:id=>id===0?null:({1:1,2:2,3:3}[id]||1),
      onFeatureLocked:feature=>window.mapFeatureGates.push(feature)});
  });
  await page.waitForFunction(()=>window.mapTest?.state?.nodes.length===50);
  assert.equal((await geometry()).chapter,'chapter_1','First entry must stay on Chapter 1');
  assert.equal(await page.locator('#stageMapChapterPrev').innerText(),'←');
  assert.equal(await page.locator('#stageMapChapterPrev').getAttribute('aria-label'),'실험실·유저 문제');
  await page.locator('#stageMapChapterPrev').click();await page.waitForTimeout(650);
  assert.equal((await geometry()).chapter,'extras');
  assert.equal(await page.locator('#stageMapChapterNext').innerText(),'→');
  assert.equal(await page.locator('#stageMapChapterNext').getAttribute('aria-label'),'Chapter 1');
  assert.equal(await page.locator('#stageMapChapterPrev').isDisabled(),true);
  const extrasCards=await page.evaluate(()=>window.mapTest.state.nodes.filter(n=>n.chapterId==='extras').map(n=>({
    id:n.id,...window.mapTest.camera.worldToScreen(n.rect.x,n.rect.y),width:n.rect.w*window.mapTest.camera.getScale(),height:n.rect.h*window.mapTest.camera.getScale()
  })));
  assert.equal(extrasCards.length,2);
  for(const card of extrasCards){assert.ok(Math.abs(card.width-320)<2);assert.ok(Math.abs(card.height-280)<2);}
  assert.equal(extrasCards[0].y,extrasCards[1].y);
  assert.ok(Math.abs(extrasCards[1].x-extrasCards[0].x-extrasCards[0].width-60)<2);
  assert.ok(Math.abs((extrasCards[0].x+extrasCards[1].x+extrasCards[1].width)/2-720)<1);
  await page.mouse.move(20,20);await page.waitForTimeout(1000);
  await page.screenshot({path:path.join(out,'extras-ko.png')});
  const labCard=extrasCards[0], userCard=extrasCards[1];
  await page.mouse.move(labCard.x+40,labCard.y+80);await page.waitForTimeout(180);
  assert.equal(await page.evaluate(()=>window.mapTest.state.extraSignalStarts.has('lab')),true);
  await page.screenshot({path:path.join(out,'extras-hover.png')});
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(()=>window.mapTest.state.extraSignalStarts.size),0);
  const clip={x:labCard.x+2,y:labCard.y+2,width:labCard.width-4,height:labCard.height-4};
  const idle=await page.screenshot({clip});await page.waitForTimeout(300);
  assert.equal(Buffer.compare(idle,await page.screenshot({clip})),0,'The hovered card must stop animating after one signal');
  await page.mouse.move(20,20);
  await page.locator('[data-extra-node="lab"]').focus();await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.mapTest.state.focusedExtraId),'lab');
  assert.equal(await page.evaluate(()=>window.mapTest.state.extraSignalStarts.has('lab')),true);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.extraNode),'user_created_stages');
  await page.waitForTimeout(150);await page.screenshot({path:path.join(out,'extras-keyboard.png')});
  await page.keyboard.press('Enter');await page.waitForTimeout(650);
  assert.equal(await page.evaluate(()=>window.mapTest.state.archiveMode.active),true,'Keyboard entry must still open the user problem archive');
  const archiveRoot=await page.evaluate(()=>{const n=window.mapTest.state.nodeLookup.get('user_created_stages');return window.mapTest.camera.worldToScreen(n.center.x,n.center.y);});
  await page.mouse.click(archiveRoot.x,archiveRoot.y);await page.waitForTimeout(650);
  assert.equal(await page.evaluate(()=>window.mapTest.state.archiveMode.active),false);
  // Keep the original demo guards even though the cards moved and look different.
  await page.evaluate(()=>{
    window.mapTest.state.nodeLookup.get('lab').previewFeature='sandbox';
    window.mapTest.state.nodeLookup.get('user_created_stages').previewFeature='problems';
    window.mapTest.refresh();
  });
  await page.locator('[data-extra-node="lab"]').focus();await page.keyboard.press('Enter');
  await page.locator('[data-extra-node="user_created_stages"]').focus();await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(()=>window.mapFeatureGates),['sandbox','problems']);
  assert.equal(await page.evaluate(()=>window.mapTest.state.archiveMode.active),false);
  assert.equal(await page.evaluate(()=>window.mapTest.state.transition.active),false);
  // The full card face, including its lower corner, shares the guarded entry action.
  await page.mouse.click(userCard.x+userCard.width-16,userCard.y+userCard.height-16);
  assert.deepEqual(await page.evaluate(()=>window.mapFeatureGates),['sandbox','problems','problems']);
  await page.evaluate(()=>{
    delete window.mapTest.state.nodeLookup.get('lab').previewFeature;
    delete window.mapTest.state.nodeLookup.get('user_created_stages').previewFeature;
    window.currentLang='en';window.mapTest.refresh();
  });
  await page.mouse.move(20,20);await page.waitForTimeout(1000);await page.screenshot({path:path.join(out,'extras-en.png')});
  await page.evaluate(()=>{window.currentLang='ko';window.mapTest.refresh();});
  await page.locator('#stageMapChapterNext').click();await page.waitForTimeout(650);
  assert.equal((await geometry()).chapter,'chapter_1');
  await setProgress();
  const scales=[];
  for(let n=1;n<=5;n++) {
    await chapter(n);const data=await geometry();scales.push(data.scale);
    await page.screenshot({path:path.join(out,`chapter-${n}-locked.png`)});
  }
  assert.ok(scales.every(s=>Math.abs(s-scales[0])<1e-8));
  let data=await geometry();assert.equal(data.edges.length,44);
  for(const edge of data.edges){assert.equal(edge.points.length,2);assert.equal(Math.hypot(edge.points[1].x-edge.points[0].x,edge.points[1].y-edge.points[0].y),52);}
  const cardPixels=data.nodes[0].rect.w*data.scale;
  assert.ok(cardPixels>=160&&cardPixels<=180,`Actual card size: ${cardPixels}px`);
  const bannerPixels=await page.evaluate(()=>window.mapTest.state.chapters[0].title.rect.h*window.mapTest.camera.getScale());
  assert.ok(bannerPixels>=110&&bannerPixels<=130,`Actual banner height: ${bannerPixels}px`);
  assert.equal(data.nodes.filter(n=>n.status.unlocked).length,7);
  await setProgress([0,1,2,3]);await chapter(1);
  assert.deepEqual(await page.evaluate(()=>Object.keys(window.mapTextSamples).filter(text=>/[✓★☆]|^(완료|Complete)$/.test(text))),[]);
  await page.screenshot({path:path.join(out,'chapter-1-reward-stars.png')});
  await setProgress([0,1,2,3,6,25,7,27]);await chapter(2);
  assert.equal((await geometry()).nodes.find(n=>n.id==='staging_register').status.locked,false);
  await page.screenshot({path:path.join(out,'chapter-2-partial.png')});
  const typography=await page.evaluate(()=>({title:window.mapTextSamples['자동문'],optional:window.mapTextSamples['선택'],status:window.mapTextSamples['잠김']}));
  assert.ok(typography.title.fontSize>=20&&typography.title.fontSize<=22);
  assert.equal(typography.title.align,'center');
  for(const kind of ['optional','status'])assert.ok(typography[kind].fontSize>=12&&typography[kind].fontSize<=14);
  assert.deepEqual(await page.evaluate(()=>Object.keys(window.mapTextSamples).filter(text=>/^STAGE\s/.test(text))),[]);
  assert.equal(await page.locator('#stageMapChapterRequirements').count(),0);
  assert.equal(await page.locator('#stageMapChapterLabel').innerText(),'MEMORY LINK');
  const keyboardScale=(await geometry()).scale;
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(600);
  assert.equal((await geometry()).chapter,'chapter_3');assert.equal((await geometry()).scale,keyboardScale);
  await page.keyboard.press('ArrowLeft');await page.waitForTimeout(600);
  assert.equal((await geometry()).chapter,'chapter_2');assert.equal((await geometry()).scale,keyboardScale);
  assert.deepEqual(await page.evaluate(()=>window.keyboardCircuitMoves),[]);
  // Text editing and gameplay retain their own arrow-key behavior.
  await page.evaluate(()=>{
    const input=document.createElement('input');input.id='keyboard-regression-input';document.body.append(input);input.focus();
  });
  await page.keyboard.press('ArrowRight');
  assert.equal((await geometry()).chapter,'chapter_2');
  assert.deepEqual(await page.evaluate(()=>window.keyboardCircuitMoves),[]);
  await page.evaluate(async()=>{
    document.getElementById('keyboard-regression-input').remove();
    (await import('./src/modules/navigation.js')).hideStageMapScreen();
  });
  await page.keyboard.press('ArrowRight');
  assert.equal((await geometry()).chapter,'chapter_2');
  assert.deepEqual(await page.evaluate(()=>window.keyboardCircuitMoves.map(move=>move.slice(0,2))),[[1,0]]);
  await page.evaluate(async()=>{(await import('./src/modules/navigation.js')).showStageMapScreen();});
  await page.keyboard.press('ArrowLeft');await page.waitForTimeout(600);
  assert.equal((await geometry()).chapter,'chapter_1');
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(600);
  assert.equal((await geometry()).chapter,'chapter_2');
  await setProgress([0,1,2,3,6,25,7,27,26,28]);
  assert.equal((await geometry()).nodes.find(n=>n.id==='staging_register').status.locked,false);
  await page.screenshot({path:path.join(out,'chapter-2-join-ready.png')});
  assert.equal(await page.locator('.stage-map-zoom').isVisible(),false);
  const before=await geometry();await page.mouse.move(900,700);
  for(const delta of [-100,100]) {
    await page.mouse.wheel(0,delta);await page.waitForTimeout(100);
    assert.equal((await geometry()).scale,before.scale,'Map wheel must not change scale');
  }
  await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control');
  await page.waitForTimeout(100);
  assert.equal((await geometry()).scale,before.scale,'Map Ctrl+wheel must not change scale');
  const canceled=await page.evaluate(()=>{
    const results=[];
    for(const target of [document.getElementById('stageMapCanvas'),document.getElementById('stageMapChapterLabel')]) {
      for(const type of ['wheel','gesturestart','gesturechange','gestureend']) {
        const event=type==='wheel'?new WheelEvent(type,{ctrlKey:true,deltaY:-100,bubbles:true,cancelable:true}):new Event(type,{bubbles:true,cancelable:true});
        target.dispatchEvent(event);results.push(event.defaultPrevented);
      }
    }
    return results;
  });
  assert.ok(canceled.every(Boolean),'Native zoom must be canceled over the canvas and map controls');
  for(const distances of [[160,320],[320,160]]) {
    await pinch(...distances);
    assert.deepEqual((await geometry()).camera,before.camera,'Map touch pinch must not move or zoom the camera');
  }
  assert.equal(await page.evaluate(()=>visualViewport.scale),1,'Native browser pinch zoom must stay disabled on the map');
  await chapter(3);assert.equal((await geometry()).scale,before.scale);
  const beforePan=await geometry();
  await page.evaluate(()=>{window.mapTest.state.selectedNodeId=null;});
  await page.mouse.move(900,700);await page.mouse.down();await page.mouse.move(950,720,{steps:8});await page.mouse.up();
  assert.deepEqual((await geometry()).camera,beforePan.camera,'Mouse dragging must not move the map');
  for(const fingers of [1,2]) {
    await swipe(fingers);
    assert.deepEqual((await geometry()).camera,beforePan.camera,`${fingers}-finger dragging must not move the map`);
    assert.equal(await page.evaluate(()=>window.mapTest.state.selectedNodeId),null,'Gestures must not activate a card on release');
  }
  const card=beforePan.nodes.find(node=>node.id==='half_adder').screen;
  // Many tiny movements must accumulate to cancel a tap, even within one card.
  await page.mouse.move(card.x,card.y);await page.mouse.down();await page.mouse.move(card.x+16,card.y,{steps:32});await page.mouse.up();
  assert.equal(await page.evaluate(()=>window.mapTest.state.selectedNodeId),null);
  assert.deepEqual((await geometry()).camera,beforePan.camera);
  await page.mouse.click(card.x,card.y);
  assert.equal(await page.evaluate(()=>window.mapTest.state.selectedNodeId),'half_adder','Card clicks remain enabled');
  await page.evaluate(()=>{window.mapTest.state.selectedNodeId=null;});
  await page.touchscreen.tap(card.x,card.y);
  assert.equal(await page.evaluate(()=>window.mapTest.state.selectedNodeId),'half_adder','Card taps remain enabled');
  await page.locator('#stageMapChapterPrev').click();await page.waitForTimeout(600);
  assert.equal((await geometry()).chapter,'chapter_2');
  assert.equal((await geometry()).scale,beforePan.scale);
  await page.locator('#stageMapChapterNext').click();await page.waitForTimeout(600);
  assert.equal((await geometry()).chapter,'chapter_3');
  const returnedCamera=(await geometry()).camera;
  assert.equal(returnedCamera.scale,beforePan.scale);
  for(const axis of ['originX','originY'])assert.ok(Math.abs(returnedCamera[axis]-beforePan.camera[axis])<0.01,'Chapter buttons must return to the same camera position within the animation threshold');
  await page.screenshot({path:path.join(out,'chapter-3-navigation-only.png')});
  await page.setViewportSize({width:900,height:650});await page.waitForTimeout(250);
  await chapter(2);await page.screenshot({path:path.join(out,'chapter-2-small.png')});
  assert.ok((await geometry()).scale<before.scale,'Window resize must still fit the map automatically');
  assert.deepEqual((await geometry()).edges,before.edges);
  await page.setViewportSize({width:1440,height:1000});
  await setProgress([30,14]);await chapter(5);
  assert.equal(await page.evaluate(()=>window.mapTest.state.chapterStatus.get('chapter_5').unlocked),false);
  await page.screenshot({path:path.join(out,'chapter-5-missing-counter.png')});
  await setProgress(STAGES.filter(s=>s.status==='playable').map(s=>s.id));
  for(let n=1;n<=5;n++){await chapter(n);await page.screenshot({path:path.join(out,`chapter-${n}-released-complete.png`)});}
  const legacy=await page.evaluate(async()=> (await import('./src/modules/stageCatalog.js')).preserveStageAccess([30,11],{}, {legacy:true}));
  await setProgress([30,11],legacy);await chapter(4);
  assert.equal((await geometry()).nodes.find(n=>n.id==='mux_4to1').status.unlocked,true);
  assert.equal((await geometry()).nodes.find(n=>n.id==='round_robin').status.unlocked,true);
  await page.screenshot({path:path.join(out,'chapter-4-legacy-access.png')});
  // Direct entry uses the same release/chapter guard as the cards.
  const guards=await page.evaluate(async()=>{
    const levels=await import('./src/modules/levels.js');const results=[];
    for(const [id,cleared] of [[29,[]],[29,[6]],[31,[29]],[31,[30]],[34,[]],[34,[30]],[32,[30]],[12,[12]]]) {
      window.testCleared=cleared;window.testAccess={};
      try{await levels.startLevel(id);results.push(true);}catch{results.push(false);}
    }
    return results;
  });
  assert.deepEqual(guards,[false,true,true,true,false,true,true,true]);
  // AC-1–7: click every playable card with only its chapter gate satisfied.
  const minimalProgress=[[],[6],[30],[30],[30,14,32]];
  for (let n=1;n<=5;n++) {
    await setProgress(minimalProgress[n-1]);
    await page.evaluate(async()=>{await (await import('./src/modules/levels.js')).returnToLevels();});
    await chapter(n);
    for (const stage of STAGES.filter(s=>s.chapterId===`chapter_${n}`)) {
      const node=(await geometry()).nodes.find(node=>node.id===stage.nodeId);
      assert.equal(node.status.unlocked,stage.status==='playable');
      await page.mouse.click(node.screen.x,node.screen.y);
      if (stage.status==='candidate') {
        assert.equal(await page.locator('#levelIntroModal').isVisible(),false);
        continue;
      }
      await page.locator('#levelIntroModal').waitFor({state:'visible'});
      assert.equal(await page.evaluate(async()=> (await import('./src/modules/levels.js')).getCurrentLevel()),stage.id);
      await page.evaluate(async()=>{await (await import('./src/modules/levels.js')).returnToLevels();});
      await chapter(n);
    }
  }
  assert.deepEqual(await page.evaluate(()=>Object.keys(window.mapTextSamples).filter(text=>/recommended|추천/i.test(text))),[]);
  const migration=await page.evaluate(async()=>{
    const levels=await import('./src/modules/levels.js');
    levels.configureLevelModule({progressProvider:null,accessProvider:null});
    let records=[30,11];
    window.db={ref:()=>({once:async()=>({forEach:callback=>records.forEach(id=>callback({key:String(id),forEach:cb=>cb({val:()=>({nickname:localStorage.getItem('username')})})}))})})};
    localStorage.setItem('unrelated-circuit-draft','keep-this-record');
    localStorage.setItem('username','v6-legacy-qa');
    await levels.loadClearedLevelsFromDb();
    const legacy=levels.getStageAccess().unlockedChapters.includes('chapter_5'),before=JSON.stringify(levels.getStageAccess());
    await levels.loadClearedLevelsFromDb();
    const idempotent=before===JSON.stringify(levels.getStageAccess());
    const versions=[];
    for (const version of [1,2,3]) {
      const owner=`chapter-access-v${version}`;
      localStorage.setItem('username',owner);records=[];
      localStorage.setItem(`stageMapAccess_v3_${owner}`,JSON.stringify({catalogVersion:version,unlockedStages:[44],unlockedChapters:['chapter_3']}));
      await levels.loadClearedLevelsFromDb();
      const saved=JSON.parse(localStorage.getItem(`stageMapAccess_v3_${owner}`));
      versions.push(saved.catalogVersion===4 && [9,8,10,38,39,46].every(id=>levels.isLevelUnlocked(id)) && levels.getClearedLevels().length===0);
    }
    localStorage.setItem('username','v6-new-qa');records=[];await levels.loadClearedLevelsFromDb();
    records=[30,11];await levels.loadClearedLevelsFromDb();
    const fresh=levels.getStageAccess().unlockedChapters.includes('chapter_5');
    localStorage.setItem('username','v6-quota-qa');
    const setter=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota test');};
    records=[];await levels.loadClearedLevelsFromDb();records=[30,11];await levels.loadClearedLevelsFromDb();
    const quotaFresh=levels.getStageAccess().unlockedChapters.includes('chapter_5');Storage.prototype.setItem=setter;
    return {legacy,idempotent,versions,fresh,quotaFresh,cleared:levels.getClearedLevels(),draft:localStorage.getItem('unrelated-circuit-draft')};
  });
  assert.deepEqual(migration,{legacy:true,idempotent:true,versions:[true,true,true],fresh:false,quotaFresh:false,cleared:[30,11],draft:'keep-this-record'});
  // Open the actual Lab in the same page: map gesture restrictions must stay local.
  await page.evaluate(async()=>{
    const lab=await import('./src/modules/labMode.js');
    window.labCamera=()=>lab.labCameraForTest();
    window.labScale=()=>lab.labCameraForTest().scale;
    lab.openLabModeFromShortcut();
  });
  await page.locator('#labOverlayCanvas').waitFor({state:'visible'});
  await page.waitForTimeout(400);
  const labScales=[await page.evaluate(()=>window.labScale())];
  await page.mouse.move(800,450);await page.mouse.wheel(0,-100);await page.waitForTimeout(100);
  labScales.push(await page.evaluate(()=>window.labScale()));
  assert.ok(labScales[1]>labScales[0],'Lab wheel zoom must remain enabled');
  await pinch(160,320);labScales.push(await page.evaluate(()=>window.labScale()));
  assert.ok(labScales[2]>labScales[1],'Lab touch pinch zoom in must remain enabled');
  await pinch(320,160);labScales.push(await page.evaluate(()=>window.labScale()));
  assert.ok(labScales[3]<labScales[2],'Lab touch pinch zoom out must remain enabled');
  const labBeforePan=await page.evaluate(()=>window.labCamera());
  await swipe(2);
  const labAfterPan=await page.evaluate(()=>window.labCamera());
  assert.notEqual(labAfterPan.originX,labBeforePan.originX,'Lab two-finger panning must remain enabled');
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'browser-check.json'),JSON.stringify({scales,cardPixels,bannerPixels,typography,extrasCards,extrasKeyboardAndGates:true,extrasSingleSignal:true,keyboardNavigation:true,buttonNavigation:true,mapGestureZoomDisabled:true,mapGesturePanDisabled:true,cardClickAndTap:true,labPanEnabled:true,labScales,arrows:44,nodes:48,guards,migration,errors},null,2));
  console.log('Stage map browser passed: progress/access guards, button/key navigation, blocked drag/swipe/pinch, card clicks/taps, resize, and Lab zoom/pan.');
}catch(error){await page.screenshot({path:path.join(out,'failure.png')});console.error(error,errors);process.exitCode=1;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
