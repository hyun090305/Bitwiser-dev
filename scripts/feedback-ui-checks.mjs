import assert from 'node:assert/strict';
import { snapshotCircuit } from '../src/canvas/circuitData.js';

// Exercise the actual game canvas and toolbar in the full/demo/Electron page.
export async function drawFeedbackWire(page, circuit) {
  const draft=structuredClone(circuit);delete draft.wires.loop;
  await page.evaluate(async c=>{
    const grid=await import('./src/modules/grid.js');
    grid.getPlayController().restoreCircuit(c);grid.adjustGridZoom();
  },draft);
  const read=()=>page.evaluate(async()=>{
    const grid=await import('./src/modules/grid.js'),data=await import('./src/canvas/circuitData.js');
    return data.snapshotCircuit(grid.getPlayCircuit());
  });
  const point=p=>page.locator('#overlayCanvas').evaluate((canvas,{r,c})=>{
    const box=canvas.getBoundingClientRect(),panel=Number(canvas.dataset.panelWidth),scale=Number(canvas.dataset.gridViewportWidth)/Number(canvas.dataset.gridBaseWidth);
    return {x:box.x+panel+(2+c*52+25)*scale,y:box.y+(2+r*52+25)*scale};
  },p);
  await page.locator('#wireStatusInfo').click();
  const route=circuit.wires.loop.path,start=await point(route[0]);
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  for (const cell of route.slice(1)) {const p=await point(cell);await page.mouse.move(p.x,p.y,{steps:4});}
  await page.mouse.up();
  const actual=await read(),loop=Object.values(actual.wires).find(w=>w.startBlockId===w.endBlockId);
  assert.ok(loop,'real canvas drew feedback');
  const expected=snapshotCircuit(circuit);delete expected.wires.loop;expected.wires[loop.id]={...circuit.wires.loop,id:loop.id};
  assert.deepEqual(actual,expected);
  await page.locator('#undoBtn').click();assert.deepEqual(await read(),snapshotCircuit(draft));
  await page.locator('#redoBtn').click();assert.deepEqual(await read(),expected);
  await page.locator('#wireMoveInfo').click();
  return expected;
}
