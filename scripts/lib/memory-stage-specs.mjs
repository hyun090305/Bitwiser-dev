import { STAGE_REFERENCE_IDS, getReferenceFSM } from '../../src/modules/referenceFSM.js';

export const memorySpecs = [
  {
    "id": 25,
    "title": [
      "저장 스위치",
      "Enabled Register"
    ],
    "inputs": [
      "DATA",
      "LOAD"
    ],
    "buttons": [
      "LOAD"
    ],
    "outputs": [
      "Q"
    ],
    "desc": [
      "DATA는 스위치, LOAD는 버튼입니다. LOAD=1인 tick에 DATA를 저장하고, LOAD=0이면 DATA가 바뀌어도 Q를 유지하세요. 초기 Q=0. 버튼은 클릭하면 즉시 바뀌고 tick 후 자동으로 꺼집니다. 모든 표는 한 번 갱신한 뒤의 출력입니다.",
      "DATA is a switch and LOAD is a button. Save DATA on a tick with LOAD=1. With LOAD=0, hold Q even when DATA changes. Initially Q=0. A button toggles immediately and turns off automatically after a tick. Every table row shows the output after that tick."
    ],
    "example": [
      [
        1,
        1
      ],
      [
        0,
        0
      ],
      [
        0,
        1
      ],
      [
        1,
        0
      ],
      [
        1,
        1
      ]
    ],
    "hint": [
      "D의 첫 입력은 저장할 DATA입니다. 두 번째 입력은 저장 허용 EN입니다. LOAD를 EN에 연결하세요.",
      "The first D input is DATA. The second is EN: connect LOAD to it."
    ]
  },
  {
    "id": 26,
    "title": [
      "토글 조명",
      "Toggle Light"
    ],
    "inputs": [
      "PRESS"
    ],
    "buttons": [
      "PRESS"
    ],
    "outputs": [
      "LIGHT"
    ],
    "example": [
      [
        0
      ],
      [
        1
      ],
      [
        1
      ],
      [
        0
      ],
      [
        1
      ]
    ],
    "desc": [
      "PRESS 버튼을 누른 tick마다 LIGHT를 반전하세요. 입력이 0인 tick에는 이전 상태를 유지합니다. 연속 tick에 누르면 매번 반전합니다. 초기 LIGHT=0. 출력은 tick 갱신 후입니다.",
      "Invert LIGHT on every tick with PRESS=1; otherwise hold it. Presses on consecutive ticks each toggle the light. Initially LIGHT=0. Observe outputs after each tick."
    ],
    "hint": [
      "현재 Q를 NOT으로 반전해 D로 돌려보내고 PRESS로 저장을 허용하세요.",
      "Feed NOT Q back into D, and enable storage with PRESS."
    ]
  },
  {
    "id": 28,
    "title": [
      "고장 기록등",
      "Sticky Fault"
    ],
    "inputs": [
      "FAULT",
      "ACK"
    ],
    "buttons": [
      "ACK"
    ],
    "outputs": [
      "ALARM"
    ],
    "example": [
      [
        1,
        0
      ],
      [
        0,
        0
      ],
      [
        1,
        1
      ],
      [
        0,
        1
      ],
      [
        0,
        0
      ]
    ],
    "desc": [
      "FAULT 스위치가 1이면 ALARM을 켜고 이후에도 유지하세요. ACK 버튼으로 끕니다. FAULT와 ACK가 함께 1이면 고장 신호가 우선하여 ALARM=1입니다. 초기 ALARM=0. 출력은 tick 갱신 후입니다.",
      "FAULT sets ALARM, which stays on until ACK. If FAULT and ACK are both 1, FAULT takes priority: ALARM=1. Initially ALARM=0. Observe outputs after each tick."
    ],
    "hint": [
      "FAULT 또는 ACK가 있을 때만 FAULT 값을 저장하면 우선순위까지 구현됩니다.",
      "Store FAULT whenever FAULT OR ACK is 1. This also gives FAULT priority."
    ]
  },
  {
    "id": 29,
    "title": [
      "준비 후 반영",
      "Staging Register"
    ],
    "inputs": [
      "DATA",
      "WRITE",
      "APPLY"
    ],
    "buttons": [
      "WRITE",
      "APPLY"
    ],
    "outputs": [
      "Q"
    ],
    "example": [
      [
        1,
        1,
        0
      ],
      [
        0,
        0,
        0
      ],
      [
        0,
        1,
        1
      ],
      [
        0,
        0,
        1
      ],
      [
        1,
        1,
        1
      ],
      [
        0,
        0,
        1
      ]
    ],
    "desc": [
      "DATA 스위치와 WRITE·APPLY 버튼을 사용합니다. WRITE는 준비 저장소에 DATA를 저장하고, APPLY는 tick 시작 시 준비되어 있던 값을 Q로 반영합니다. 둘을 동시에 누르면 새 DATA는 준비 저장소에, 이전 준비 값은 Q에 저장됩니다. 두 저장소는 0에서 시작합니다. RESET 입력은 없습니다.",
      "WRITE stores DATA in a staging bit. APPLY publishes the staging value from the START of that tick as Q. Together, WRITE stores new DATA while APPLY publishes the old staging bit. Both bits start at 0. There is no RESET input. Outputs are observed after the tick."
    ],
    "hint": [
      "D 두 개를 직렬로 연결하고 각각 WRITE, APPLY를 EN으로 사용하세요. 같은 tick의 D들은 모두 이전 Q를 읽습니다.",
      "Connect two D blocks in series with WRITE and APPLY as their respective EN inputs. All D blocks read the previous Q values."
    ]
  },
  {
    "id": 30,
    "title": [
      "자동으로 닫히는 문",
      "Automatic Door"
    ],
    "inputs": [
      "OPEN"
    ],
    "buttons": [
      "OPEN"
    ],
    "outputs": [
      "DOOR"
    ],
    "example": [
      [
        1
      ],
      [
        0
      ],
      [
        1
      ],
      [
        0
      ],
      [
        0
      ],
      [
        0
      ]
    ],
    "extra": [
      [
        [
          1
        ],
        [
          0
        ],
        [
          0
        ],
        [
          0
        ]
      ],
      [
        [
          1
        ],
        [
          1
        ],
        [
          1
        ],
        [
          0
        ],
        [
          0
        ],
        [
          0
        ]
      ]
    ],
    "desc": [
      "OPEN 버튼을 누른 tick부터 3 tick 동안 DOOR=1을 유지한 뒤 닫으세요. 열린 동안 다시 누르면 그 tick부터 3 tick으로 연장합니다. OPEN 1,0,0,0 → DOOR 1,1,1,0. OPEN 1,0,1,0,0,0 → DOOR 1,1,1,1,1,0. 초기 상태는 모두 0이며 출력은 갱신 후입니다.",
      "OPEN keeps DOOR=1 for three ticks, including the press tick. A new press restarts that three-tick window. OPEN 1,0,0,0 → DOOR 1,1,1,0. OPEN 1,0,1,0,0,0 → DOOR 1,1,1,1,1,0. All memory starts at 0; observe outputs after each tick."
    ],
    "hint": [
      "직렬 D 세 개로 최근 세 번의 OPEN을 기억하고 OR로 합치세요.",
      "Use three D blocks in series to remember the latest three OPEN samples, and OR their outputs."
    ]
  },
  {
    "id": 31,
    "title": [
      "변화 감지기",
      "Rising Edge Detector"
    ],
    "inputs": [
      "SIGNAL"
    ],
    "buttons": [],
    "outputs": [
      "RISE"
    ],
    "example": [
      [
        0
      ],
      [
        1
      ],
      [
        1
      ],
      [
        0
      ],
      [
        1
      ],
      [
        0
      ]
    ],
    "desc": [
      "SIGNAL을 바꾸면 즉시 RISE = SIGNAL AND NOT(이전 tick에 저장한 SIGNAL)을 출력하세요. 초기 기억은 0입니다. SIGNAL을 0에서 1로 켜면 tick 전에 RISE=1이고, tick이 현재 SIGNAL을 저장하면 RISE=0입니다. 표는 각 행의 입력을 적용한 뒤, tick 전의 출력입니다. 관측 후 tick을 한 번 실행하고 다음 행으로 진행하세요.",
      "Output RISE = SIGNAL AND NOT(the SIGNAL stored at the previous tick) immediately when SIGNAL changes. Memory starts at 0. Turning SIGNAL on produces RISE=1 before the tick; the tick stores SIGNAL and RISE becomes 0. Each example row observes outputs BEFORE its tick, then advances one tick."
    ],
    "hint": [
      "SIGNAL을 D에 저장하고, 현재 SIGNAL과 NOT(D의 Q)를 AND로 연결하세요. 검출 결과는 OUTPUT으로 직접 보냅니다.",
      "Store SIGNAL in D. Connect current SIGNAL AND NOT(D output) directly to RISE."
    ]
  },
  {
    "id": 34,
    "title": [
      "응답 감시기",
      "Watchdog"
    ],
    "inputs": [
      "KICK"
    ],
    "buttons": [
      "KICK"
    ],
    "outputs": [
      "TIMEOUT"
    ],
    "example": [
      [
        0
      ],
      [
        0
      ],
      [
        0
      ],
      [
        0
      ],
      [
        1
      ],
      [
        0
      ],
      [
        0
      ],
      [
        0
      ]
    ],
    "desc": [
      "KICK 버튼이 없는 tick을 세세요. 세 번째 연속 무응답 tick부터 TIMEOUT=1을 유지합니다. KICK을 누른 tick에는 카운터와 TIMEOUT을 즉시 0으로 초기화합니다. 초기 카운터는 0이며 출력은 tick 갱신 후입니다.",
      "Count ticks without KICK. From the third consecutive idle tick, hold TIMEOUT=1. KICK resets the count and TIMEOUT to 0 on that tick. The count starts at 0; observe outputs after the update."
    ],
    "hint": [
      "2비트 카운터를 3에서 멈추게 하세요. KICK이 있으면 두 비트를 0으로 저장합니다.",
      "Use a two-bit counter that saturates at 3. KICK stores 0 into both bits."
    ]
  },
  {
    "id": 35,
    "title": [
      "흔들림 제거기",
      "Debouncer"
    ],
    "inputs": [
      "RAW"
    ],
    "buttons": [],
    "outputs": [
      "CLEAN"
    ],
    "example": [
      [
        1
      ],
      [
        0
      ],
      [
        1
      ],
      [
        1
      ],
      [
        1
      ],
      [
        0
      ],
      [
        1
      ],
      [
        0
      ],
      [
        0
      ],
      [
        0
      ]
    ],
    "desc": [
      "RAW 스위치의 같은 값이 세 tick 연속 관찰되면 그 값으로 CLEAN을 바꾸세요. 짧은 흔들림은 무시합니다. 0→1과 1→0 모두 세 번 연속되어야 합니다. 이전 두 입력과 CLEAN은 0에서 시작하며 출력은 갱신 후입니다.",
      "Change CLEAN only after observing the same RAW value for three consecutive ticks. Ignore shorter glitches. Both rising and falling changes require three samples. The two previous samples and CLEAN start at 0; observe outputs after the tick."
    ],
    "hint": [
      "D 두 개로 이전 두 RAW를 기억하세요. 현재 값까지 세 값이 모두 1이면 저장, 모두 0이면 해제하고 나머지는 유지합니다.",
      "Remember two previous RAW samples with D blocks. Set CLEAN when all three samples are 1; clear it when all are 0; otherwise hold."
    ]
  }
];

export function answersFor(spec) {
  return {mode:'sequential', referenceId:STAGE_REFERENCE_IDS[spec.id]};
}

// Examples are presentation only. Grading always uses the complete FSM.
export function exampleRowsFor(spec) {
  const ref=getReferenceFSM(STAGE_REFERENCE_IDS[spec.id]);
  let state=ref.initialState;
  return spec.example.map((bits,i)=>{
    const input=bits.reduce((n,b,j)=>n|(b<<j),0);
    const current=ref.evaluate(state,input);
    state=current.nextState;
    const outputs=spec.id===31?current.outputs:ref.evaluate(state,input).outputs;
    return {tick:i+1, observation:spec.id===31?'before':'after',
      ...Object.fromEntries(ref.inputs.map((name,j)=>[name,(input>>>j)&1])),
      ...Object.fromEntries(ref.outputs.map((name,j)=>[name,(outputs>>>j)&1]))};
  });
}

export const referenceGraphs = {
  34:{size:[14,16],nodes:[['KICK','INPUT',0,8],['nk','NOT',3,8],['q0','D',3,3],['q1','D',8,3],['n0','NOT',1,3],['o0','OR',1,8],['a0','AND',1,12],['o1','OR',8,8],['a1','AND',8,12],['out','AND',10,3],['TIMEOUT','OUTPUT',12,3]],edges:[['KICK','nk'],['q0','n0'],['n0','o0'],['q1','o0'],['o0','a0'],['nk','a0'],['a0','q0'],['q0','o1'],['q1','o1'],['o1','a1'],['nk','a1'],['a1','q1'],['q0','out'],['q1','out'],['out','TIMEOUT']]},
  35:{size:[13,16],nodes:[['RAW','INPUT',1,2],['h1','D',1,6],['h2','D',1,10],['set','AND',5,6],['any','OR',5,10],['clear','NOT',8,10],['j','JUNCTION',5,2],['en','OR',8,6],['q','D',8,2],['CLEAN','OUTPUT',11,2]],edges:[['RAW','h1'],['h1','h2'],['RAW','set'],['h1','set'],['h2','set'],['RAW','any'],['h1','any'],['h2','any'],['any','clear'],['set','j'],['j','q'],['j','en'],['clear','en'],['en','q','EN'],['q','CLEAN']]},
  25:{size:[6,8], nodes:[['DATA','INPUT',2,0],['LOAD','INPUT',0,4],['q','D',2,4],['Q','OUTPUT',2,7]], edges:[['DATA','q'],['LOAD','q','EN'],['q','Q']]},
  26:{size:[8,9], nodes:[['PRESS','INPUT',0,4],['q','D',3,4],['n','NOT',3,1],['LIGHT','OUTPUT',3,8]], edges:[['q','n'],['n','q'],['PRESS','q','EN'],['q','LIGHT']]},
  27:{size:[9,11], nodes:[['A','INPUT',0,1],['B','INPUT',8,1],['SEL','INPUT',4,0],['n','NOT',2,3],['a','AND',0,6],['b','AND',8,6],['o','OR',4,7],['OUT','OUTPUT',4,10]], edges:[['SEL','n'],['n','a'],['A','a'],['SEL','b'],['B','b'],['a','o'],['b','o'],['o','OUT']]},
  28:{size:[7,10], nodes:[['FAULT','INPUT',2,0],['ACK','INPUT',6,4],['o','OR',4,4],['q','D',2,6],['ALARM','OUTPUT',2,9]], edges:[['FAULT','q'],['FAULT','o'],['ACK','o'],['o','q','EN'],['q','ALARM']]},
  29:{size:[6,13], nodes:[['DATA','INPUT',2,0],['WRITE','INPUT',0,4],['s','D',2,4],['APPLY','INPUT',0,8],['q','D',2,8],['Q','OUTPUT',2,12]], edges:[['DATA','s'],['WRITE','s','EN'],['s','q'],['APPLY','q','EN'],['q','Q']]},
  30:{size:[9,13], nodes:[['OPEN','INPUT',2,0],['a','D',2,3],['b','D',2,6],['c','D',2,9],['o','OR',6,6],['DOOR','OUTPUT',6,12]], edges:[['OPEN','a'],['a','b'],['b','c'],['a','o'],['b','o'],['c','o'],['o','DOOR']]},
  31:{size:[9,13], nodes:[['SIGNAL','INPUT',2,0],['p','D',2,4],['n','NOT',2,7],['a','AND',6,7],['RISE','OUTPUT',6,12]], edges:[['SIGNAL','p'],['p','n'],['SIGNAL','a'],['n','a'],['a','RISE']]},
  7:{size:[6,6], nodes:[['IN1','INPUT',0,0],['IN2','INPUT',0,4],['IN3','INPUT',4,4],['a','AND',2,0],['o','OR',2,4],['b','AND',4,2],['c','OR',4,0],['OUT1','OUTPUT',2,2]], edges:[['IN1','a'],['IN2','a'],['IN1','o'],['IN2','o'],['o','b'],['IN3','b'],['a','c'],['b','c'],['c','OUT1']]},
  11:{size:[10,10], nodes:[['IN1','INPUT',2,2],['IN2','INPUT',6,6],['n1','NOT',6,2],['n2','NOT',2,6],['a','AND',4,4],['b','AND',8,4],['c','AND',0,4],['d','AND',4,8],['OUT1','OUTPUT',4,0],['OUT2','OUTPUT',9,7],['OUT3','OUTPUT',0,0],['OUT4','OUTPUT',4,9]],edges:[['IN1','n1'],['IN2','n2'],['n1','a'],['n2','a'],['n1','b'],['IN2','b'],['IN1','c'],['n2','c'],['IN1','d'],['IN2','d'],['a','OUT1'],['b','OUT2'],['c','OUT3'],['d','OUT4']]},
  23:{size:[9,7], nodes:[['IN1','INPUT',0,0],['IN2','INPUT',0,2],['IN3','INPUT',0,4],['IN4','INPUT',0,6],['OUT1','OUTPUT',8,0],['OUT2','OUTPUT',8,2],['OUT3','OUTPUT',8,4],['OUT4','OUTPUT',8,6],['j4','JUNCTION',2,6],['n4','NOT',2,5],['o3','OR',2,3],['n3','NOT',4,3],['o2','OR',2,1],['n2','NOT',4,1],['a1','AND',6,0],['a2','AND',6,2],['a3','AND',6,4]],edges:[['IN4','OUT4'],['IN4','j4'],['j4','n4'],['j4','o3'],['IN3','o3'],['o3','n3'],['o3','o2'],['IN2','o2'],['o2','n2'],['IN1','a1'],['n2','a1'],['IN2','a2'],['n3','a2'],['IN3','a3'],['n4','a3'],['a1','OUT1'],['a2','OUT2'],['a3','OUT3']]}
};
