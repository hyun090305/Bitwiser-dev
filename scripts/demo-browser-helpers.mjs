// Observe canvas label positions in tests so stage selection uses the actual
// map's pointer hit testing, without adding shortcuts to the product.
export async function observeMap(context) {
  await context.addInitScript(() => {
    window.mapLabels = {};
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (label, x, y, ...rest) {
      if (this.canvas.id === 'stageMapCanvas') {
        const p = this.getTransform().transformPoint(new DOMPoint(x, y));
        const box = this.canvas.getBoundingClientRect();
        window.mapLabels[label] = {
          x: box.x + p.x * box.width / this.canvas.width,
          y: box.y + p.y * box.height / this.canvas.height
        };
      }
      return fillText.call(this, label, x, y, ...rest);
    };
  });
}
export async function goToMap(page) {
  if (await page.locator('#gameScreen').isVisible()) {
    await page.locator('#systemMenuBtn').click();
    await page.locator('#backToLevelsBtn').click();
  }
  await page.locator('#stageMapCanvas').waitFor({ state: 'visible' });
}
export async function enterStage(page, id) {
  await goToMap(page);
  const target = await page.evaluate(async id => {
    const catalog = await import('./src/modules/stageCatalog.js');
    const title=id===30&&window.currentLang==='ko'?'자동문':(await import('./src/modules/levels.js')).getLevelTitle(id);
    return {chapter: catalog.chapterForStage(id).order, name:title.toUpperCase()};
  }, id);
  for(let attempt=0;attempt<6;attempt++) {
    const current=Number((await page.locator('.stage-map-chapter-nav').getAttribute('data-chapter-id')).match(/chapter_(\d+)/)?.[1] || 0);
    if(current===target.chapter)break;
    await page.evaluate(()=>{window.mapLabels={};});
    await page.locator(current<target.chapter?'#stageMapChapterNext':'#stageMapChapterPrev').click();
    await page.waitForTimeout(800);
  }
  const name = target.name;
  await page.waitForFunction(name => Object.entries(window.mapLabels).some(([k,p]) => (k.toUpperCase()===name || name.startsWith(k.toUpperCase()+' ')) && p.x>0 && p.x<innerWidth && p.y>0 && p.y<innerHeight), name);
  // Allow the existing clear celebration/focus animation to settle.
  await page.waitForTimeout(1000);
  const point = await page.evaluate(name => Object.entries(window.mapLabels).find(([k,p]) => (k.toUpperCase()===name || name.startsWith(k.toUpperCase()+' ')) && p.x>0 && p.x<innerWidth && p.y>0 && p.y<innerHeight)[1], name);
  await page.mouse.click(point.x + 3, point.y);
  await page.locator('#startLevelBtn').click();
  await page.locator('#levelIntroModal').waitFor({ state: 'hidden' });
}
export async function openSettings(page) {
  if (await page.locator('#gameScreen').isVisible()) {
    await page.locator('#systemMenuBtn').click();
    await page.locator('#demoSettingsBtn').click();
  } else await page.locator('#settingsBtn').click();
}
