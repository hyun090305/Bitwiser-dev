// Guided experiment before the enabled-register puzzle. This never changes the design.
export function createMemoryTutorial(circuit, element, lang) {
  let step=0, storedAt=0;
  const copy=[
    ['D 블록을 놓고 DATA → D → VALUE를 연결하세요. 먼저 LOAD는 연결하지 않습니다.', 'Place D and connect DATA → D → VALUE. Leave LOAD disconnected for this first experiment.'],
    ['DATA를 1로 바꾸고 다음 tick을 누르세요. 입력 하나인 D는 매 tick 저장합니다.', 'Set DATA to 1 and press Next tick. A D block with one input stores on every tick.'],
    ['DATA를 0으로 바꿔 보세요. 아직 tick을 누르지 않으면 VALUE는 저장한 1을 유지합니다.', 'Set DATA to 0. Before the next tick, VALUE still holds the stored 1.'],
    ['다음 tick을 누르세요. 이제 D가 새 DATA=0을 저장합니다.', 'Press Next tick. D now stores the new DATA=0.'],
    ['LOAD를 같은 D의 두 번째 입력 EN으로 연결하세요. D/EN이 뒤바뀌면 D를 짧게 클릭해 교환합니다.', 'Connect LOAD to the second input, EN, on that D. Briefly click D to swap D/EN if necessary.'],
    ['DATA=1, LOAD 버튼, 다음 tick 순서로 저장하세요. 이어 DATA=0으로 바꾸고 LOAD 없이 tick을 진행해 VALUE=1 유지도 확인하세요.', 'Set DATA=1, press LOAD, then Next tick. Change DATA to 0 and tick without LOAD to check that VALUE still holds 1.'],
    ['✓ 저장과 유지 확인 완료. 회로 실행으로 모든 도달 가능한 상태와 입력을 검증하세요.', '✓ Store and hold verified. Run Circuit verifies every reachable state and input.']
  ];
  let enabledStoreAt=0;
  return state=>{
    const blocks=Object.values(circuit.blocks),wires=Object.values(circuit.wires);
    const data=blocks.find(b=>b.name==='DATA'&&b.type==='INPUT'), load=blocks.find(b=>b.name==='LOAD'&&b.type==='INPUT');
    const q=blocks.find(b=>b.type==='D'&&wires.some(w=>w.startBlockId===data?.id&&w.endBlockId===b.id&&w.inputRole==='D'));
    const outgoing=q&&wires.some(w=>w.startBlockId===q.id&&['VALUE','Q'].includes(circuit.blocks[w.endBlockId]?.name));
    const en=q&&wires.some(w=>w.startBlockId===load?.id&&w.endBlockId===q.id&&w.inputRole==='EN');
    if(q&&outgoing&&step===0)step=en?5:1;
    if(step===1&&state.tick>0&&state.memory.get(q?.id)&&state.lastTick?.inputs.get(data?.id)){step=2;storedAt=state.tick;}
    if(step===2&&!data?.value&&state.tick===storedAt&&state.memory.get(q?.id))step=3;
    if(step===3&&state.tick>storedAt&&!state.memory.get(q?.id))step=4;
    if(step===4&&en)step=5;
    if(step===5&&en&&state.lastTick?.inputs.get(load?.id)&&state.memory.get(q?.id))enabledStoreAt=state.tick;
    if(step===5&&enabledStoreAt&&state.tick>enabledStoreAt&&!state.lastTick?.inputs.get(load?.id)&&!state.lastTick?.inputs.get(data?.id)&&state.memory.get(q?.id))step=6;
    element.dataset.tutorialStep=String(step);
    element.textContent=`${Math.min(step+1,6)}/6 · ${copy[step][lang==='en'?1:0]}`;
  };
}
