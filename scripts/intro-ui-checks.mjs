import assert from 'node:assert/strict';

// Measure the final rendered layout, including content outside the scrollport.
export async function verifyIntroCards(page, { table, stageId, context }) {
  const result = await page.evaluate(() => {
    const modal = document.getElementById('levelIntroModal');
    modal.getAnimations({ subtree:true }).forEach(animation => animation.finish());
    const rect = el => {
      const r = el.getBoundingClientRect();
      return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
    };
    const scroller = document.getElementById('truthTableContainer');
    scroller.scrollLeft = 0; scroller.scrollTop = 0;
    const cards = [...document.querySelectorAll('#truthTable .level-intro-case')].map(card => ({
      rect:rect(card),
      children:[...card.children].map(rect),
      tick:card.querySelector('.level-intro-tick')?.textContent,
      sides:[...card.querySelectorAll('.level-intro-case__side')].map(side =>
        [...side.querySelectorAll('.level-intro-case__bit')].map(bit => ({
          rect:rect(bit), marginLeft:parseFloat(getComputedStyle(bit).marginLeft),
          label:bit.querySelector('.level-intro-case__bit-label').textContent,
          value:bit.querySelector('.level-intro-case__bit-value').textContent,
          contents:[...bit.children].map(rect),
          overflow:bit.scrollWidth>bit.clientWidth+1 || bit.scrollHeight>bit.clientHeight+1
        })))
    }));
    const outsideOverflow = ['html', '#levelIntroModal', '.level-intro-screen__panel', '#introDesc', '#introRules', '#startLevelBtn']
      .filter(selector => { const e=document.querySelector(selector); return !e.hidden && e.scrollWidth>e.clientWidth+1; });
    const left = rect(scroller).x, right = left+scroller.clientWidth;
    scroller.scrollLeft = scroller.scrollWidth;
    const scroll = { max:scroller.scrollLeft, width:scroller.clientWidth, contentWidth:scroller.scrollWidth, left, right,
      ends:[...document.querySelectorAll('#truthTable .level-intro-case')].map(card => rect(card.lastElementChild)),
      keyboard:scroller.tabIndex===0 };
    scroller.scrollTop = scroller.scrollHeight;
    const last = rect(document.querySelector('#truthTable .level-intro-case:last-child'));
    scroll.lastBottom = last.bottom;
    scroll.bottom = rect(scroller).y+scroller.clientHeight;
    scroller.scrollLeft = 0; scroller.scrollTop = 0;
    return { cards, outsideOverflow, scroll };
  });
  const { cards, outsideOverflow, scroll } = result;
  assert.deepEqual(outsideOverflow, [], `${context}: only the examples may scroll horizontally`);
  assert.equal(cards.length, table.length, context);
  assert.ok(scroll.keyboard, `${context}: keyboard focusable examples`);
  const plainLabel = label => label.replace(/[₀-₉]/g, digit => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(digit)));
  cards.forEach((card, i) => {
    const signals = card.sides.flat();
    const original = table[i];
    const sourceKey = label => stageId===15 ? ({R1:'S1',R0:'S0'}[plainLabel(label)] || plainLabel(label)) : plainLabel(label);
    assert.deepEqual(signals.map(s => sourceKey(s.label)).sort(), Object.keys(original).filter(k => !['tick','observation'].includes(k)).sort(), context);
    for (const signal of signals) {
      assert.equal(signal.value, String(original[sourceKey(signal.label)]).trim(), context);
      assert.doesNotMatch(signal.label, /[₀-₉]/, `${context}: truth-table IO uses ordinary digits`);
      assert.equal(signal.marginLeft, 0, `${context}: no guessed group indent`);
      assert.equal(signal.overflow, false, `${context}: unclipped label/value`);
      for (const r of signal.contents) {
        assert.ok(r.x>=signal.rect.x && r.right<=signal.rect.right+1 && r.y>=signal.rect.y && r.bottom<=signal.rect.bottom+1, context);
      }
    }
    if (original.tick != null) assert.match(card.tick, new RegExp(`^tick ${original.tick}(?:$| · )`), context);
    for (const side of card.sides) {
      for (const bit of side) {
        assert.ok(Math.abs(bit.rect.y-side[0].rect.y)<1 && Math.abs(bit.rect.bottom-side[0].rect.bottom)<1, `${context}: signals on one line`);
      }
    }
    const center = r => (r.y+r.bottom)/2;
    for (const child of card.children) assert.ok(Math.abs(center(child)-center(card.rect))<1, `${context}: tick, sides and arrow centered`);
    for (let n=1;n<card.children.length;n++) assert.ok(card.children[n].x>=card.children[n-1].right, `${context}: no overlapping card parts`);
    for (const previous of cards.slice(0,i)) assert.ok(card.rect.x>=previous.rect.right-1 || card.rect.right<=previous.rect.x+1 || card.rect.y>=previous.rect.bottom-1, `${context}: whole cards wrap without overlap`);
    assert.ok(card.rect.x>=scroll.left-1, `${context}: left edge reachable at scroll start`);
    assert.ok(scroll.ends[i].right<=scroll.right+1, `${context}: right edge reachable at scroll end`);
  });
  assert.ok(scroll.lastBottom<=scroll.bottom+1, `${context}: last row reachable`);
  if (cards.some(card => card.rect.width>scroll.width+1)) assert.ok(scroll.max>0, `${context}: wide cards scroll inside examples`);
  return { scroll, firstCard:cards[0] };
}
