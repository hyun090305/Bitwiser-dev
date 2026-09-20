import assert from 'node:assert/strict';

// Runs against the actual shared UI in full web, demo, and Electron sessions.
export async function verifyGameplayActions(page, { demo = false, screenshot } = {}) {
  const menu = page.locator('#systemMenuBtn');
  const focused = () => page.evaluate(() => document.activeElement?.id);
  const assertClosed = async () => {
    assert.equal(await page.locator('#systemMenuDrawer').isVisible(), false);
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal(await focused(), 'systemMenuBtn');
  };
  assert.equal(await menu.innerText(), '≡');
  assert.deepEqual(await page.locator('#systemMenuDrawer button').evaluateAll(nodes => nodes.map(n => n.id)),
    ['continueGameBtn', 'gameSettingsBtn', 'controlsBtn', 'backToLevelsBtn']);
  for (const id of ['showIntroBtn', 'hintBtn', demo ? 'demoShareBtn' : 'exportGifBtn', 'viewRankingBtn']) {
    assert.equal(await page.locator(`#rightPanel #${id}`).count(), 1);
  }
  if (demo) assert.equal(await page.locator('#saveCircuitBtn, #viewSavedBtn, #nativeSaveNotice').count(), 0);
  else assert.equal(await page.locator('#circuitManagement #saveCircuitBtn, #circuitManagement #viewSavedBtn').count(), 2);

  await page.locator('#showIntroBtn').click();
  await page.locator('#levelIntroModal').waitFor({ state: 'visible' });
  await page.locator('#startLevelBtn').click();
  const hasHints = await page.evaluate(async () => {
    const levels = await import('./src/modules/levels.js');
    return !!levels.getLevelHints()[`stage${levels.getCurrentLevel()}`]?.hints;
  });
  if (hasHints) {
    await page.locator('#hintBtn').click();
    await page.locator('#hintModal').waitFor({ state: 'visible' });
    await page.locator('#closeHintBtn').click();
  } else {
    await page.evaluate(() => { window.testOriginalAlert = window.alert; window.alert = message => { window.testHintAlert = message; }; });
    try {
      await page.locator('#hintBtn').click();
      assert.equal(await page.evaluate(() => window.testHintAlert), await page.evaluate(() => window.t('noHints')));
    } finally {
      await page.evaluate(() => { window.alert = window.testOriginalAlert; delete window.testOriginalAlert; delete window.testHintAlert; });
    }
  }

  await menu.click();
  assert.equal(await focused(), 'continueGameBtn');
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await focused(), 'backToLevelsBtn');
  await page.keyboard.press('Tab');
  assert.equal(await focused(), 'continueGameBtn');
  await page.locator('#continueGameBtn').click(); await assertClosed();
  await menu.click(); await page.keyboard.press('Escape'); await assertClosed();
  await menu.click(); await page.locator('#systemMenuBackdrop').click({ position: { x: 5, y: 5 } }); await assertClosed();

  const originalSfx = await page.locator('#sfxCheckbox').isChecked();
  await menu.click(); await page.locator('#gameSettingsBtn').click();
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  await page.locator('#settingsModal').waitFor({ state: 'visible' });
  await page.locator('#sfxCheckbox').setChecked(!originalSfx);
  assert.equal(await page.evaluate(async () => (await import('./src/modules/storage.js')).getSfxEnabledSetting()), !originalSfx);
  await page.keyboard.press('Escape'); await assertClosed();
  await menu.click(); await page.locator('#gameSettingsBtn').click();
  assert.equal(await page.locator('#sfxCheckbox').isChecked(), !originalSfx);
  await page.locator('#sfxCheckbox').setChecked(originalSfx);
  await page.locator('#settingsCloseBtn').click(); await assertClosed();

  const before = await page.evaluate(async () => JSON.stringify((await import('./src/modules/grid.js')).getPlayCircuit()));
  await menu.click(); await page.locator('#controlsBtn').click();
  await page.locator('#controlsDialog').waitFor({ state: 'visible' });
  const reference = await page.locator('#controlsList li').allTextContents();
  assert.deepEqual(reference, await page.evaluate(() => ['wireStatusInfo', 'wireDeleteInfo', 'wireSelectInfo', 'DeleteAllInfo', 'undoBtn', 'redoBtn', 'copySelectionBtn', 'pasteSelectionBtn'].map(id => document.getElementById(id).getAttribute('aria-label'))));
  const ko = await page.evaluate(() => window.currentLang === 'ko');
  assert.match(reference.join('\n'), ko ? /마우스 오른쪽/ : /Right click/);
  assert.match(reference.join('\n'), ko ? /Ctrl \/ Cmd/ : /Ctrl or Cmd/);
  for (const key of ['R', 'Z', 'Y', 'C', 'V']) assert.ok(reference.some(label => label.includes(key)));
  for (const key of ['r', 'z', 'y', 'ArrowRight']) await page.keyboard.press(key);
  assert.equal(await page.evaluate(async () => JSON.stringify((await import('./src/modules/grid.js')).getPlayCircuit())), before);
  if (screenshot) await page.screenshot({ path: `${screenshot}-controls.png` });
  await page.keyboard.press('Escape'); await assertClosed();
  await menu.click(); await page.locator('#controlsBtn').click();
  await page.locator('#controlsCloseBtn').click(); await assertClosed();

  const tooltips = await page.locator('#rightPanel .has-tooltip').evaluateAll(nodes => nodes.map(n => ({
    id: n.id, label: n.getAttribute('aria-label'), tooltip: n.dataset.tooltip, icon: !!n.querySelector('img, span[aria-hidden=true]')
  })));
  for (const item of tooltips) {
    assert.ok(item.icon, item.id);
    assert.ok(item.label, item.id);
    const normalize = text => text.replace(/\bor\b/g, '/').replace(/\s/g, '');
    assert.equal(normalize(item.tooltip), normalize(item.label), item.id);
  }
  await page.locator('#wireStatusInfo').hover();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('wireStatusInfo'), '::after').opacity === '1');
  await page.mouse.move(0, 0);
  await page.locator('#rightPanel').evaluate(el => { el.scrollTop = 0; });
  const layout = await page.evaluate(() => {
    const panel = document.getElementById('rightPanel'), frame = document.getElementById('consoleFrame');
    const grade = document.getElementById('gradeButton').getBoundingClientRect();
    const help = document.getElementById('stageQuickActions').getBoundingClientRect();
    const row = document.querySelector('.circuit-action-row');
    return { panelDisplay: getComputedStyle(panel).display, panelFits: panel.scrollWidth <= panel.clientWidth, frameFits: frame.scrollWidth <= frame.clientWidth,
      directHelp: help.top >= grade.bottom && help.top - grade.bottom < 20,
      managementFits: row.scrollWidth <= row.clientWidth, canvasWidth: document.getElementById('overlayCanvas').getBoundingClientRect().width };
  });
  assert.ok(layout.panelFits && layout.frameFits && layout.managementFits && layout.directHelp, JSON.stringify(layout));
  assert.equal(layout.panelDisplay, 'flex');
  assert.ok(layout.canvasWidth > 500, JSON.stringify(layout));
  if (screenshot) await page.screenshot({ path: `${screenshot}-editor.png` });
  return layout;
}
