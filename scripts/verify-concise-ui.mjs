import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium, _electron } from 'playwright';
import { verifySignalSurfaces } from './signal-ui-checks.mjs';
import { verifyIntroCards } from './intro-ui-checks.mjs';
import { observeMap, goToMap } from './demo-browser-helpers.mjs';

const root = path.resolve('.'), out = path.join(root, 'test-results/concise-ui');
await fs.mkdir(out, { recursive: true });
const native = process.argv.includes('--electron');
const browser = native ? null : await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const measurements = [];
// Optional local copies of the production Google fonts allow isolated font QA.
const testFonts = process.env.INTRO_FONT_DIR ? await Promise.all([
  ['Press Start 2P', 'intro-press-start.ttf'], ['Noto Sans KR', 'intro-noto.ttf']
].map(async ([family, file]) => ({ family, source:`url(data:font/ttf;base64,${(await fs.readFile(path.join(process.env.INTRO_FONT_DIR, file))).toString('base64')})` }))) : [];
const copy = JSON.parse(await fs.readFile('scripts/data/stage-copy.json', 'utf8'));
// Reviewed literal translations; expected strings never call the UI formatter.
const introText = JSON.parse(await fs.readFile('tests/fixtures/intro-text.json', 'utf8'));
const report = [];
try {
  for (const surface of native ? ['electron'] : process.argv.includes('--demo') ? ['demo'] : ['full', 'demo']) {
    let server, app;
    const files = surface === 'demo' ? path.join(root, 'dist-web-demo') : root;
    try {
      if (native) {
        const profile = await fs.mkdtemp(path.join(out, 'electron-'));
        const env = { ...process.env, BITWISER_TEST_PROFILE: profile, BITWISER_TEST_VISIBLE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
        app = await _electron.launch({ args:[path.join(root, 'scripts/electron-save-test-entry.cjs')], env });
      } else {
        server = createServer(async (req, res) => {
          try {
            const url = new URL(req.url, 'http://localhost').pathname;
            const file = path.resolve(files, '.' + (url === '/' ? '/index.html' : url));
            if (!file.startsWith(files + path.sep)) { res.writeHead(403).end(); return; }
            const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.mp3':'audio/mpeg', '.gif':'image/gif' };
            const body = await fs.readFile(file);
            res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' }).end(body);
          } catch { res.writeHead(404).end(); }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      }
      const base = server ? `http://127.0.0.1:${server.address().port}` : null;
      for (const lang of ['ko', 'en']) {
        const context = native ? app.context() : await browser.newContext({ serviceWorkers:'block', viewport:{width:1440,height:980} });
        await observeMap(context);
        if (!native) await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
        await context.addInitScript(lang => {
          if (lang) localStorage.setItem('lang', lang);
          window.firebase = { initializeApp(){}, database:()=>undefined };
        }, native ? null : lang);
        const page = native ? await app.firstWindow() : await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.stack));
        if (native) {
          await page.waitForURL('app://bitwiser/index.html',{waitUntil:'domcontentloaded'});
          await page.evaluate(lang=>localStorage.setItem('lang',lang),lang);
          await page.reload();
        } else await page.goto(base);
        if (testFonts.length) await page.evaluate(async fonts => {
          for (const {family, source} of fonts) document.fonts.add(await new FontFace(family, source).load());
          await document.fonts.ready;
          for (const {family} of fonts) if (!document.fonts.check(`16px "${family}"`)) throw new Error(`Font not loaded: ${family}`);
        }, testFonts);
        await page.locator('#loadingStartBtn').click();
        if (surface === 'demo') await page.locator('#startLevelBtn').click();
        await goToMap(page);
        const focus = async id => {
          await page.evaluate(id => { window.mapLabels = {}; document.dispatchEvent(new CustomEvent('stageMap:focusChapter', {detail:`chapter_${id}`})); }, id);
          await page.waitForFunction(id => {
            const p=window.mapLabels[`CHAPTER ${id}`];
            return p && Math.abs(p.x-innerWidth/2)<1;
          }, id);
        };
        const setStars = async total => {
          await page.evaluate(async total => {
            const levels = await import('./src/modules/levels.js');
            const stageStars = Object.fromEntries(Array.from({length:47}, (_,i) => [i+1, Math.max(0, Math.min(3, total-i*3))]));
            levels.configureLevelModule({progressProvider:()=>[], accessProvider:()=>({catalogVersion:5,stageStars,unlockedChapters:['chapter_1'],pendingChapters:[]})});
            await levels.loadClearedLevelsFromDb();
          }, total);
        };
        for (const width of (process.argv.includes('--signals') ? [] : [1440, 900, 420, 360])) {
          await page.setViewportSize({width,height:width < 500 ? 780 : 980});
          for (const total of surface === 'demo' ? [0] : [1,61,141]) {
            if (surface !== 'demo') await setStars(total);
            for (const id of [1,2,5]) {
              await focus(id);
              assert.equal(await page.locator('#chapterTotalStars').innerText(), `★ ${total}`);
              const layout = await page.evaluate(() => {
                const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
                const stars = document.getElementById('chapterTotalStars');
                return { stars:rect('#chapterTotalStars'), prev:rect('#stageMapChapterPrev'), next:rect('#stageMapChapterNext'), nav:rect('.stage-map-chapter-nav'), label:rect('#stageMapChapterLabel'),
                  independent:!stars.closest('.stage-map-chapter-nav'), overflow:stars.scrollWidth>stars.clientWidth,
                  hud:[...document.querySelectorAll('.stage-map-hud button')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}),
                  banner:Object.entries(window.mapLabels).filter(([name])=>/^CHAPTER /.test(name)) };
              });
              assert.ok(layout.independent && !layout.overflow);
              assert.ok(layout.stars.x > width/2 && layout.stars.right <= width && layout.stars.y >= 0,JSON.stringify({surface,lang,width,total,id,stars:layout.stars}));
              assert.ok(Math.abs(layout.prev.width-layout.next.width)<1);
              assert.ok(Math.abs((layout.label.x+layout.label.right)/2-width/2)<1);
              assert.ok(layout.nav.x>=0 && layout.nav.right<=width);
              assert.ok(layout.banner.length>0,'observe the rendered chapter banner');
              for (const h of layout.hud) assert.ok(h.right<=layout.stars.x || h.x>=layout.stars.right || h.bottom<=layout.stars.y || h.y>=layout.stars.bottom, 'stars clear the menu');
              for (const [,p] of layout.banner) assert.ok(p.y>layout.stars.bottom, 'banner below the global count');
              assert.equal(await page.locator('#chapterIntro, .chapter-lock-progress').count(),0);
              const locked = surface === 'demo' ? id>1 : total < [0,0,18,36,50,84][id];
              assert.equal(await page.locator('.chapter-lock-overlay').isVisible(),locked);
              if (locked) {
                const restricted = surface==='demo' && id>2;
                assert.equal(await page.locator('.chapter-lock-title').innerText(),restricted ? (lang==='ko'?'정식판 전용':'Full version only') : (lang==='ko'?'챕터 잠김':'Chapter locked'));
                assert.equal(await page.locator('.chapter-lock-requirement').isVisible(),!restricted);
                if (!restricted) assert.equal(await page.locator('.chapter-lock-requirement').innerText(),`★ ${total}/${[0,0,18,36,50,84][id]}`);
                const p = await page.locator('.chapter-lock-panel').boundingBox();
                if (!(p.x>=0 && p.x+p.width<=width && p.y+p.height<layout.nav.y)) await page.screenshot({path:path.join(out,`${surface}-${lang}-layout-failure.png`)});
                assert.ok(p.x>=0 && p.x+p.width<=width && p.y+p.height<layout.nav.y,JSON.stringify({surface,lang,width,total,id,p,nav:layout.nav}));
              }
              if (width===360 && id===5 && total!==141) await page.screenshot({path:path.join(out,`${surface}-${lang}-map-${total}.png`)});
            }
          }
        }
        const ids = await page.evaluate(async()=>Object.keys((await import('./src/modules/levels.js')).getLevelTitles()).map(Number));
        await page.evaluate(async()=>{
          await (await import('./src/modules/levels.js')).startLevel(1);
          const nav=await import('./src/modules/navigation.js'); nav.hideStageMapScreen(); nav.showGameScreen();
        });
        await page.locator('#levelIntroModal').waitFor({state:'visible'});
        const stageData = await page.evaluate(async () => (await import('./src/modules/levels.js')).getLoadedStageData());
        for (const width of (process.argv.includes('--signals') ? [] : [1440,900,420,360])) {
          await page.setViewportSize({width,height:780});
          for (const id of ids) {
            await page.evaluate(async id => {
              (await import('./src/modules/levels.js')).showIntroModal(id);
              document.querySelector('.level-intro-screen__panel').scrollTop=0;
            },id);
            assert.equal(await page.locator('#introTitle').innerText(),copy[id].title);
            assert.equal(await page.locator('#introDesc').innerText(),introText[id]?.[lang] ?? copy[id][lang]);
            assert.deepEqual(await page.locator('#introRules tr').evaluateAll(rows=>rows.map(r=>[...r.cells].map(c=>c.textContent))),copy[id].rules[lang].map((rule,i) => introText[id]?.rules?.[lang]?.[i] ?? rule));
            assert.doesNotMatch(await page.locator('#introDesc').innerText() + await page.locator('#introRules').innerText(), /[₀-₉]/);
            if (id===15) {
              assert.deepEqual(await page.locator('#truthTable .level-intro-case').first().locator('.level-intro-case__side--output .level-intro-case__bit-label').allTextContents(),['R1','R0']);
              assert.deepEqual(await page.locator('#truthTable .level-intro-case').nth(1).locator('.level-intro-case__side--output .level-intro-case__bit-value').allTextContents(),['1','1']);
            }
            const layout = await verifyIntroCards(page, {
              table:stageData.levelDescriptions[id].table, stageId:id, context:`${surface}/${lang}/${width}/stage ${id}`
            });
            if ([1,32,39,44,46].includes(id)) {
              measurements.push({surface,lang,width,id,...layout});
              if (id===32 || width===360) {
                await page.screenshot({path:path.join(out,`${surface}-${lang}-${width}-guide-${id}-left.png`)});
                if (layout.scroll.max>0) {
                  await page.locator('#truthTableContainer').evaluate(e=>e.scrollLeft=e.scrollWidth);
                  await page.screenshot({path:path.join(out,`${surface}-${lang}-${width}-guide-${id}-right.png`)});
                }
              }
            }
            const reachable=await page.evaluate(()=>{
              const panel=document.querySelector('.level-intro-screen__panel'); panel.scrollTop=panel.scrollHeight;
              const p=panel.getBoundingClientRect(), b=document.getElementById('startLevelBtn').getBoundingClientRect();
              return b.width>0 && b.y>=p.y && b.bottom<=p.bottom && b.right<=p.right;
            });
            assert.ok(reachable,`${surface}/${lang}/${width}/stage ${id}: start button reachable by vertical scroll`);
          }
        }
        // A custom problem reuses the intro after an official rules/fixed-I/O guide.
        if (surface!=='demo') {
          for (const id of [22,44]) {
            await page.evaluate(async id=>{
              (await import('./src/modules/levels.js')).showIntroModal(id);
              (await import('./src/modules/problemEditor.js')).showProblemIntro({id:9,title:'Custom IN1 32',table:[{IN2:1,IN1:0,OUT1:1,OUT2:0}]});
            },id);
            assert.equal(await page.locator('#introFixedIO').isVisible(),false);
            assert.equal(await page.locator('#introRules').isVisible(),false);
            assert.equal(await page.locator('#introTitle').innerText(),'Custom IN1 32');
            assert.equal(await page.locator('#introDesc').innerText(),'목표 출력 패턴을 유지하도록 Custom IN1 32 노드를 복구하십시오.');
            assert.deepEqual(await page.locator('#truthTable .level-intro-case__bit-label').allTextContents(),['IN2','IN1','OUT1','OUT2']);
            await verifyIntroCards(page, {table:[{IN2:1,IN1:0,OUT1:1,OUT2:0}],context:`${surface}/${lang}/custom after ${id}`});
          }
        }
        await verifySignalSurfaces(page, { ids, surface, lang, out });
        // Open common instructions through the actual game menu.
        await page.evaluate(async()=>{
          const levels=await import('./src/modules/levels.js'); await levels.startLevel(1);
          const nav=await import('./src/modules/navigation.js'); nav.hideStageMapScreen(); nav.showGameScreen();
        });
        await page.locator('#startLevelBtn').click();
        await page.locator('#systemMenuBtn').click(); await page.locator('#controlsBtn').click();
        await page.locator('#controlsDialog').waitFor({state:'visible'});
        assert.match(await page.locator('#controlsBasicsTitle').innerText(),lang==='ko'?/신호/:/Signals/);
        assert.match(await page.locator('#controlsTicks').innerText(),/D/);
        assert.match(await page.locator('#controlsOutputs').innerText(),/DONE/);
        assert.deepEqual(errors,[]);
        report.push({surface,lang,guides:ids.length,guideWidths:process.argv.includes('--signals')?[]:[1440,900,420,360],mapWidths:process.argv.includes('--signals')?[]:[1440,900,420,360],fonts:testFonts.map(font=>font.family),errors});
        console.log(`Verified concise UI: ${surface}/${lang}`);
        if (!native) await context.close();
      }
    } finally { await app?.close(); if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));} }
  }
  await fs.writeFile(path.join(out,native?'electron.json':'web-demo.json'),JSON.stringify(report,null,2));
  await fs.writeFile(path.join(out,native?'intro-electron.json':'intro-web-demo.json'),JSON.stringify(measurements,null,2));
  console.log(JSON.stringify(report));
} finally { await browser?.close(); }
