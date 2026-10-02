// ==================================================
// LUDO ALIENÍGENA - CLIENT
// ==================================================

const socket = typeof io !== 'undefined' ? io() : null;
let myId = null;
let currentRoom = null;
let roomState = null;
let selectedMode = 'A';
let soundEnabled = localStorage.getItem('alpha_sound') !== 'false';

// ========== CONSTANTES DO TABULEIRO ==========
const PATH = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],
  [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],
  [6,0]
];

const START_INDICES = [0, 13, 26, 39];
const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const FINISH_POS = 56;

const HOME_COLUMNS = [
  [[7,1],[7,2],[7,3],[7,4],[7,5]],
  [[1,7],[2,7],[3,7],[4,7],[5,7]],
  [[7,13],[7,12],[7,11],[7,10],[7,9]],
  [[13,7],[12,7],[11,7],[10,7],[9,7]]
];

const BASE_POSITIONS = [
  [[1,1],[1,4],[4,1],[4,4]],
  [[1,10],[1,13],[4,10],[4,13]],
  [[10,10],[10,13],[13,10],[13,13]],
  [[10,1],[10,4],[13,1],[13,4]]
];

const CENTER = [7,7];

// ========== PERSISTÊNCIA ==========
const STORAGE = {
  clientId: 'alpha_clientId',
  name: 'alpha_name',
  avatar: 'alpha_avatar',
  sound: 'alpha_sound'
};

function getClientId() {
  let id = localStorage.getItem(STORAGE.clientId);
  if (!id) {
    id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(STORAGE.clientId, id);
  }
  return id;
}
const CLIENT_ID = getClientId();

function getStoredName() { return localStorage.getItem(STORAGE.name) || ''; }
function getStoredAvatar() {
  try { return JSON.parse(localStorage.getItem(STORAGE.avatar) || '{}'); }
  catch (e) { return {}; }
}
function saveProfile(name) {
  if (name) localStorage.setItem(STORAGE.name, name);
}

// ========== SOM ==========
let audioCtx = null;

function initAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
}

function playBeep(freq, duration, type, vol) {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function playSequence(notes) {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;
  let t = 0;
  notes.forEach(n => {
    setTimeout(() => playBeep(n[0], n[1], n[2] || 'square', n[3] || 0.06), t);
    t += n[1] * 1000 * 0.9;
  });
}

const SOUNDS = {
  dice: () => playSequence([[800, 0.06], [600, 0.06], [1000, 0.06], [500, 0.06]]),
  move: () => playBeep(700, 0.08, 'sine', 0.05),
  capture: () => playSequence([[300, 0.1, 'sawtooth'], [200, 0.15, 'sawtooth'], [100, 0.3, 'square']]),
  turn: () => playSequence([[600, 0.08], [800, 0.12]]),
  win: () => playSequence([[523, 0.15], [659, 0.15], [784, 0.15], [1047, 0.5]]),
  lose: () => playSequence([[400, 0.2, 'sawtooth'], [300, 0.2, 'sawtooth'], [200, 0.4, 'sawtooth']]),
  chat: () => playBeep(1500, 0.03, 'sine', 0.03),
  eliminate: () => playSequence([[400, 0.2], [250, 0.3], [150, 0.4]])
};

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem(STORAGE.sound, soundEnabled);
  document.getElementById('soundToggle').innerText = soundEnabled ? '🔊' : '🔇';
}

// ========== TOAST ==========
function showToast(title, message, type) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.innerHTML = `<b>${title}</b>${message}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

// ========== UI HELPERS ==========
function toggleForm(type) {
  const bc = document.getElementById('btnMenuCreate');
  const bj = document.getElementById('btnMenuJoin');
  const fc = document.getElementById('formCreate');
  const fj = document.getElementById('formJoin');
  bc.classList.remove('active');
  bj.classList.remove('active');
  fc.style.display = 'none';
  fj.style.display = 'none';
  if (type === 'create') { bc.classList.add('active'); fc.style.display = 'block'; }
  else { bj.classList.add('active'); fj.style.display = 'block'; }
}

function selectMode(mode) {
  selectedMode = mode;
  document.getElementById('modeA').classList.toggle('selected', mode === 'A');
  document.getElementById('modeB').classList.toggle('selected', mode === 'B');
}

function generateAvatarHTML(c, opts) {
  if (!c) c = {};
  if (!opts) opts = {};
  const bg = (c.bg && c.bg !== 'none') ? `<img src="../../images/${c.bg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;" />` : '';
  const body = `<img src="../../images/rimk.png" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:2;" />`;
  const suit = (c.suit && c.suit !== 'none') ? `<img src="../../images/${c.suit}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:3;" />` : '';
  const hair = (c.facialHair && c.facialHair !== 'none') ? `<img src="../../images/${c.facialHair}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:4;" />` : '';
  const eye = (c.eyewear && c.eyewear !== 'none') ? `<img src="../../images/${c.eyewear}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:5;" />` : '';
  return `<div style="position:relative;width:100%;height:100%;background:#000;">${bg}${body}${suit}${hair}${eye}</div>`;
}

function updatePreview() {
  const box = document.getElementById('avatarPreview');
  if (box) box.innerHTML = generateAvatarHTML(getStoredAvatar());
}

// ========== LÓGICA DO JOGO ==========
function canMovePawn(pawnPos, dice) {
  if (pawnPos === -1) return dice === 6;
  if (pawnPos >= FINISH_POS) return false;
  if (pawnPos + dice > FINISH_POS) return false;
  return true;
}

function getRingIndex(playerIndex, relativePos) {
  return (START_INDICES[playerIndex] + relativePos) % 52;
}
// ========== RENDERIZAÇÃO DO TABULEIRO ==========
const PATH_COLOR_OWNERS = [
  0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1,
  1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1,
  2, 2, 2, 2, 2, -1, -1, -1, -1, -1, -1, -1, -1,
  3, 3, 3, 3, 3, -1, -1, -1, -1, -1, -1, -1, -1
];

function buildBoard() {
  const board = document.getElementById('ludoBoard');
  if (!board) return;

  board.querySelectorAll('.cell, .center-overlay').forEach(c => c.remove());

  const colors = getColorsForMode();
  const grid = {};

  const basePositions = [
    { r0: 0, c0: 0, colorIdx: 0 },
    { r0: 0, c0: 9, colorIdx: 1 },
    { r0: 9, c0: 9, colorIdx: 2 },
    { r0: 9, c0: 0, colorIdx: 3 }
  ];
  basePositions.forEach(b => {
    for (let r = b.r0; r < b.r0 + 6; r++) {
      for (let c = b.c0; c < b.c0 + 6; c++) {
        grid[`${r}-${c}`] = { type: 'base', colorIdx: b.colorIdx };
      }
    }
  });

  PATH.forEach((p, i) => {
    grid[`${p[0]}-${p[1]}`] = {
      type: 'path', idx: i,
      safe: SAFE_INDICES.has(i),
      colorOwner: PATH_COLOR_OWNERS[i]
    };
  });

  HOME_COLUMNS.forEach((col, playerIdx) => {
    col.forEach((pos, i) => {
      grid[`${pos[0]}-${pos[1]}`] = { type: 'home-col', colorIdx: playerIdx, idx: i };
    });
  });

  grid[`${CENTER[0]}-${CENTER[1]}`] = { type: 'center' };

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cellData = grid[`${r}-${c}`];
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;

      if (cellData) {
        if (cellData.type === 'base') {
          cell.classList.add('base');
          cell.style.background = hexWithAlpha(colors[cellData.colorIdx].hex, 0.12);
        } else if (cellData.type === 'path') {
          cell.classList.add('path');
          if (cellData.safe) cell.classList.add('safe');
          if (cellData.colorOwner >= 0) {
            cell.style.background = colors[cellData.colorOwner].hex;
            cell.style.opacity = '0.55';
            cell.style.border = '1px solid rgba(0,0,0,0.4)';
          }
          cell.dataset.pathIdx = cellData.idx;
        } else if (cellData.type === 'home-col') {
          cell.classList.add('home-col');
          cell.style.background = hexWithAlpha(colors[cellData.colorIdx].hex, 0.45);
          cell.style.border = `1px solid ${colors[cellData.colorIdx].hex}`;
        } else if (cellData.type === 'center') {
          cell.classList.add('center');
        }
      } else {
        cell.style.background = 'transparent';
      }

      board.appendChild(cell);
    }
  }

  // Overlay do centro (4 quadrantes)
  const overlay = document.createElement('div');
  overlay.className = 'center-overlay';
  // Q0 top-left, Q1 top-right, Q2 bottom-right, Q3 bottom-left (mesma ordem dos playerIndex)
  const quadOrder = [0, 1, 3, 2]; // ordem no grid: TL, TR, BL, BR
  overlay.innerHTML = quadOrder.map(idx => {
    const c = colors[idx] || colors[0];
    return `<div class="quad" style="color:${c.hex};"></div>`;
  }).join('');
  board.appendChild(overlay);
}

  // Bases
  const basePositions = [
    { r0: 0, c0: 0, colorIdx: 0 },
    { r0: 0, c0: 9, colorIdx: 1 },
    { r0: 9, c0: 9, colorIdx: 2 },
    { r0: 9, c0: 0, colorIdx: 3 }
  ];
  basePositions.forEach(b => {
    for (let r = b.r0; r < b.r0 + 6; r++) {
      for (let c = b.c0; c < b.c0 + 6; c++) {
        grid[`${r}-${c}`] = { type: 'base', colorIdx: b.colorIdx };
      }
    }
  });

  // Caminho
  PATH.forEach((p, i) => {
    grid[`${p[0]}-${p[1]}`] = {
      type: 'path',
      idx: i,
      safe: SAFE_INDICES.has(i),
      colorOwner: PATH_COLOR_OWNERS[i]
    };
  });

  // Colunas finais
  HOME_COLUMNS.forEach((col, playerIdx) => {
    col.forEach((pos, i) => {
      grid[`${pos[0]}-${pos[1]}`] = { type: 'home-col', colorIdx: playerIdx, idx: i };
    });
  });

  // Centro
  grid[`${CENTER[0]}-${CENTER[1]}`] = { type: 'center' };

  // Renderiza
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cellData = grid[`${r}-${c}`];
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;

      if (cellData) {
        if (cellData.type === 'base') {
          cell.classList.add('base');
          cell.style.background = hexWithAlpha(colors[cellData.colorIdx].hex, 0.12);
        } else if (cellData.type === 'path') {
          cell.classList.add('path');
          if (cellData.safe) cell.classList.add('safe');
          if (cellData.colorOwner >= 0) {
            // Casa colorida do jogador dono do trecho
            cell.style.background = colors[cellData.colorOwner].hex;
            cell.style.opacity = '0.55';
            cell.style.border = '1px solid rgba(0,0,0,0.4)';
          }
          cell.dataset.pathIdx = cellData.idx;
        } else if (cellData.type === 'home-col') {
          cell.classList.add('home-col');
          cell.style.background = hexWithAlpha(colors[cellData.colorIdx].hex, 0.45);
          cell.style.border = `1px solid ${colors[cellData.colorIdx].hex}`;
        } else if (cellData.type === 'center') {
          cell.classList.add('center');
        }
      } else {
        cell.style.background = 'transparent';
      }

      board.appendChild(cell);
    }
  }
}

function hexWithAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getColorsForMode() {
  const mode = roomState?.mode || selectedMode;
  if (mode === 'B') {
    return [
      { name: 'Rimk Verde',   hex: '#aaff00', dark: '#557700', team: 'RIMK' },
      { name: 'Rimk Água',    hex: '#00ffcc', dark: '#006655', team: 'RIMK' },
      { name: 'Zunk Roxo',    hex: '#aa66ff', dark: '#553388', team: 'ZUNK' },
      { name: 'Zunk Vermelho',hex: '#ff3366', dark: '#881133', team: 'ZUNK' }
    ];
  }
  return [
    { name: 'Coral',       hex: '#ff6633', dark: '#883311' },
    { name: 'Verde-Limão', hex: '#aaff00', dark: '#557700' },
    { name: 'Amarelo',     hex: '#ffcc00', dark: '#886600' },
    { name: 'Azul',        hex: '#3366ff', dark: '#112288' }
  ];
}

// ========== RENDER DOS PEÕES ==========
const pawnElements = {}; // { "playerId#pawnIdx": { el, pos } }

function getPawnCoords(pos, playerIndex, pawnIdx) {
  if (pos === -1) return BASE_POSITIONS[playerIndex][pawnIdx];
  if (pos >= 0 && pos <= 50) return PATH[getRingIndex(playerIndex, pos)];
  if (pos >= 51 && pos <= 55) return HOME_COLUMNS[playerIndex][pos - 51];
  if (pos === 56) return CENTER;
  return null;
}

function positionPawnEl(el, pos, playerIndex, pawnIdx) {
  const coords = getPawnCoords(pos, playerIndex, pawnIdx);
  if (!coords) return;
  const rowPct = (coords[0] + 0.5) / 15 * 100;
  const colPct = (coords[1] + 0.5) / 15 * 100;
  el.style.left = colPct + '%';
  el.style.top = rowPct + '%';
}

function getCellCenter(row, col) {
  return {
    left: (col + 0.5) / 15 * 100,
    top: (row + 0.5) / 15 * 100
  };
}

function getCenterQuadrantPos(playerIndex, pawnIdx) {
  // Q0 = top-left (40-50, 40-50)
  // Q1 = top-right (50-60, 40-50)
  // Q2 = bottom-right (50-60, 50-60)
  // Q3 = bottom-left (40-50, 50-60)
  const qStartX = (playerIndex === 0 || playerIndex === 3) ? 40 : 50;
  const qStartY = (playerIndex === 0 || playerIndex === 1) ? 40 : 50;
  const slot = pawnIdx % 4;
  const sx = slot % 2;
  const sy = Math.floor(slot / 2);
  return {
    left: qStartX + 2.5 + sx * 5,
    top: qStartY + 2.5 + sy * 5
  };
}

function renderPawns() {
  if (!roomState || !roomState.players) return;
  const board = document.getElementById('ludoBoard');
  if (!board) return;
  const colors = getColorsForMode();

  const desired = {};
  roomState.players.forEach(p => {
    if (p.eliminated) return;
    if (!p.pawns) return;
    p.pawns.forEach((pos, idx) => {
      const key = `${p.id}#${idx}`;
      desired[key] = {
        playerId: p.id, pawnIdx: idx, pos,
        playerIndex: p.playerIndex,
        color: (colors[p.playerIndex] || colors[0]).hex
      };
    });
  });

  Object.keys(pawnElements).forEach(key => {
    if (!desired[key]) {
      pawnElements[key].el.remove();
      delete pawnElements[key];
    }
  });

  Object.entries(desired).forEach(([key, data]) => {
    let entry = pawnElements[key];

    if (!entry) {
      const el = document.createElement('div');
      el.className = 'pawn';
      el.dataset.playerId = data.playerId;
      el.dataset.pawnIdx = data.pawnIdx;
      el.style.background = data.color;
      el.style.color = data.color;
      board.appendChild(el);
      entry = { el, pos: data.pos, playerIndex: data.playerIndex, pawnIdx: data.pawnIdx };
      pawnElements[key] = entry;
    } else {
      entry.el.style.background = data.color;
      entry.el.style.color = data.color;
      entry.playerIndex = data.playerIndex;
      entry.pawnIdx = data.pawnIdx;
    }

    const isMyPawn = data.playerId === myId;
    const isMyTurn = roomState.currentTurnId === myId;
    const dice = roomState.dice;
    entry.el.classList.remove('movable');
    entry.el.onclick = null;
    if (isMyPawn && isMyTurn && dice !== null && canMovePawn(data.pos, dice)) {
      entry.el.classList.add('movable');
      entry.el.onclick = (e) => { e.stopPropagation(); movePawn(data.pawnIdx); };
    }

    if (entry.pos !== data.pos) {
      const from = entry.pos;
      const to = data.pos;
      entry.pos = to;
      animatePawn(entry.el, from, to, data.playerIndex, data.pawnIdx);
    }
  });

  layoutAllPawns();
}

function layoutAllPawns() {
  const cellPct = 100 / 15;
  const groups = {};

  Object.entries(pawnElements).forEach(([key, entry]) => {
    const pos = entry.pos;

    // Peão que chegou: posiciona no quadrante do centro
    if (pos === 56) {
      const c = getCenterQuadrantPos(entry.playerIndex, entry.pawnIdx);
      entry.el.style.left = c.left + '%';
      entry.el.style.top = c.top + '%';
      entry.el.style.width = '3.5%';
      entry.el.style.height = '3.5%';
      entry.el.style.zIndex = 6 + entry.pawnIdx;
      return;
    }

    const coords = getPawnCoords(pos, entry.playerIndex, entry.pawnIdx);
    if (!coords) return;
    const gk = coords[0] + '-' + coords[1];
    if (!groups[gk]) groups[gk] = [];
    groups[gk].push({ entry, coords });
  });

  Object.values(groups).forEach(group => {
    const n = group.length;
    let size, offsets;

    if (n === 1) {
      size = cellPct * 0.82;
      offsets = [[0, 0]];
    } else if (n === 2) {
      size = cellPct * 0.58;
      offsets = [[0, -cellPct * 0.2], [0, cellPct * 0.2]];
    } else if (n === 3) {
      size = cellPct * 0.5;
      offsets = [
        [0, -cellPct * 0.22],
        [-cellPct * 0.22, cellPct * 0.16],
        [cellPct * 0.22, cellPct * 0.16]
      ];
    } else {
      size = cellPct * 0.46;
      offsets = [
        [-cellPct * 0.22, -cellPct * 0.22],
        [cellPct * 0.22, -cellPct * 0.22],
        [-cellPct * 0.22, cellPct * 0.22],
        [cellPct * 0.22, cellPct * 0.22]
      ];
    }

    group.forEach((item, i) => {
      const base = getCellCenter(item.coords[0], item.coords[1]);
      const off = offsets[i % offsets.length];
      item.entry.el.style.left = (base.left + off[0]) + '%';
      item.entry.el.style.top = (base.top + off[1]) + '%';
      item.entry.el.style.width = size + '%';
      item.entry.el.style.height = size + '%';
      item.entry.el.style.zIndex = 5 + i;
    });
  });
}

function animatePawn(el, from, to, playerIndex, pawnIdx) {
  const cellPct = 100 / 15;

  // Teleporta (sai da base ou volta pra base)
  if (from === -1 || to === -1 || to < from) {
    setTimeout(() => layoutAllPawns(), 50);
    return;
  }

  const steps = [];
  for (let p = from + 1; p <= to; p++) steps.push(p);

  el.style.zIndex = 100;
  el.style.width = (cellPct * 0.82) + '%';
  el.style.height = (cellPct * 0.82) + '%';

  let i = 0;
  function step() {
    if (i >= steps.length) {
      el.style.zIndex = '';
      layoutAllPawns();
      return;
    }
    const pos = steps[i];
    if (pos === 56) {
      const c = getCenterQuadrantPos(playerIndex, pawnIdx);
      el.style.left = c.left + '%';
      el.style.top = c.top + '%';
    } else {
      const coords = getPawnCoords(pos, playerIndex, pawnIdx);
      if (coords) {
        const c = getCellCenter(coords[0], coords[1]);
        el.style.left = c.left + '%';
        el.style.top = c.top + '%';
      }
    }
    i++;
    setTimeout(step, 230);
  }
  step();
}

// ========== RENDER DA LISTA DE JOGADORES ==========
function renderPlayersList() {
  const el = document.getElementById('playersList');
  if (!el || !roomState) return;
  const colors = getColorsForMode();

  el.innerHTML = roomState.players.map(p => {
    const color = colors[p.playerIndex] || colors[0];
    const finished = p.pawns.filter(x => x === FINISH_POS).length;
    const isCurrent = p.id === roomState.currentTurnId;

    let cls = 'player-row';
    if (isCurrent) cls += ' current';
    if (p.finished) cls += ' finished';
    if (p.eliminated) cls += ' eliminated';

    const teamTag = p.team ? `<span class="end-team team-${p.team.toLowerCase()}">${p.team}</span>` : '';

    return `
      <div class="${cls}">
        <span class="color-dot" style="background:${color.hex}; color:${color.hex};"></span>
        <span class="player-name">
          ${p.id === myId ? '👤 ' : ''}${p.name}
          ${p.disconnected ? ' ⚠' : ''}
          ${teamTag}
        </span>
        <span class="pawn-count">${finished}/4 🏁</span>
      </div>
    `;
  }).join('');
}

// ========== RENDER DO TOPO (TURNO) ==========
function renderTurnInfo() {
  if (!roomState) return;
  const colors = getColorsForMode();
  const currentPlayer = roomState.players.find(p => p.id === roomState.currentTurnId);
  const nameEl = document.getElementById('turnPlayerName');
  const dotEl = document.getElementById('turnDot');

  if (!currentPlayer) {
    if (nameEl) nameEl.innerText = '----';
    if (dotEl) dotEl.style.background = 'transparent';
    return;
  }

  const color = colors[currentPlayer.playerIndex] || colors[0];
  if (nameEl) nameEl.innerText = currentPlayer.name + (currentPlayer.id === myId ? ' (Você)' : '');
  if (dotEl) {
    dotEl.style.background = color.hex;
    dotEl.style.color = color.hex;
  }

  // Habilita/desabilita botão de rolar
  const btn = document.getElementById('btnRoll');
  const hint = document.getElementById('rollHint');
  const myTurn = currentPlayer.id === myId;
  const diceRolled = roomState.dice !== null;

  if (btn) {
    btn.disabled = !myTurn || diceRolled || roomState.state !== 'PLAYING';
  }

  if (hint) {
    if (!myTurn) {
      hint.innerText = `Aguardando ${currentPlayer.name}...`;
    } else if (diceRolled) {
      const pawnsMovable = currentPlayer.pawns.filter(p => canMovePawn(p, roomState.dice));
      if (pawnsMovable.length === 0) {
        hint.innerText = 'Sem jogadas válidas...';
      } else if (pawnsMovable.length === 1) {
        hint.innerText = 'Clique no peão para mover';
      } else {
        hint.innerText = 'Escolha qual peão mover';
      }
    } else {
      hint.innerText = 'Sua vez! Role o dado.';
    }
  }

  // Mostra dado atual
  const diceEl = document.getElementById('diceDisplay');
  if (diceEl) {
    diceEl.innerText = roomState.dice ? diceToEmoji(roomState.dice) : '🎲';
  }
}

function diceToEmoji(n) {
  return ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][n - 1] || '🎲';
}

// ========== RENDER DE CHAT ==========
function addChatMessage(boxId, sender, text, type) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'chat-msg' + (type ? ' ' + type : '');
  if (type === 'system') el.innerHTML = `🤖 <b>[SISTEMA]:</b> ${text}`;
  else if (type === 'alert') el.innerHTML = `⚠️ <b>[ALERTA]:</b> ${text}`;
  else el.innerHTML = `<b>${sender}:</b> ${text}`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}
// ========== AÇÕES DO USUÁRIO ==========
function createRoom() {
  const name = document.getElementById('username').value.trim();
  if (!name) return showToast('⚠️ ERRO', 'Digite seu nome!', 'zunk');
  saveProfile(name);
  const maxPlayers = parseInt(document.getElementById('maxPlayersInput').value) || 4;
  if (socket) {
    socket.emit('ludoCreate', {
      name,
      avatar: getStoredAvatar(),
      mode: selectedMode,
      maxPlayers
    });
  }
}

function joinRoom() {
  const name = document.getElementById('username').value.trim();
  if (!name) return showToast('⚠️ ERRO', 'Digite seu nome!', 'zunk');
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!code) return showToast('⚠️ ERRO', 'Digite o código!', 'zunk');
  saveProfile(name);
  if (socket) {
    socket.emit('ludoJoin', { name, avatar: getStoredAvatar(), code });
  }
}

function toggleReady() {
  if (!currentRoom || !socket) return;
  socket.emit('ludoReady', { code: currentRoom });
}

function startLudo() {
  if (!currentRoom || !socket) return;
  socket.emit('ludoStart', { code: currentRoom });
}

function rollDice() {
  if (!currentRoom || !socket) return;
  const diceEl = document.getElementById('diceDisplay');
  if (diceEl) {
    diceEl.classList.add('rolling');
    setTimeout(() => diceEl.classList.remove('rolling'), 600);
  }
  SOUNDS.dice();
  socket.emit('ludoRoll', { code: currentRoom });
}

function movePawn(pawnIndex) {
  if (!currentRoom || !socket) return;
  SOUNDS.move();
  socket.emit('ludoMove', { code: currentRoom, pawnIndex });
}

function sendLobbyChat() {
  const input = document.getElementById('lobbyChatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text || !currentRoom || !socket) return;
  socket.emit('ludoChat', { code: currentRoom, text });
  input.value = '';
}

function sendGameChat() {
  const input = document.getElementById('gameChatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text || !currentRoom || !socket) return;
  socket.emit('ludoChat', { code: currentRoom, text });
  input.value = '';
}

function closeCaptureModal() {
  document.getElementById('captureModal').classList.remove('open');
}

function backToLobby() {
  // Apenas recarrega a página (o servidor já mantém a sala viva)
  location.reload();
}

function spawnConfetti() {
  const colors = ['#ffcc00', '#00ff66', '#00ffff', '#ff3366', '#aa66ff'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.top = '-20px';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = (Math.random() * 1.5) + 's';
    c.style.animationDuration = (2 + Math.random() * 2) + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 5000);
  }
}

// ========== SOCKET LISTENERS ==========
if (socket) {

  socket.on('connect', () => {
    myId = socket.id;
    socket.emit('identify', { clientId: CLIENT_ID });
  });

  socket.on('errorMsg', (msg) => showToast('⚠️ ERRO', msg, 'zunk'));

  // ========== ENTRAR NA SALA ==========
  socket.on('ludoJoined', (data) => {
    currentRoom = data.code;
    document.getElementById('setupView').style.display = 'none';
    document.getElementById('lobbyView').style.display = 'block';
    document.getElementById('gameView').style.display = 'none';
    document.getElementById('endView').style.display = 'none';
    document.getElementById('displayRoomCode').innerText = data.code;
  });

  // ========== LOBBY ==========
  socket.on('ludoLobby', (data) => {
    const colors = data.mode === 'B'
      ? [{hex:'#aaff00',name:'Rimk Verde',team:'RIMK'},{hex:'#00ffcc',name:'Rimk Água',team:'RIMK'},{hex:'#aa66ff',name:'Zunk Roxo',team:'ZUNK'},{hex:'#ff3366',name:'Zunk Vermelho',team:'ZUNK'}]
      : [{hex:'#ff6633',name:'Coral'},{hex:'#aaff00',name:'Verde-Limão'},{hex:'#ffcc00',name:'Amarelo'},{hex:'#3366ff',name:'Azul'}];

    document.getElementById('queueCount').innerText = data.players.length + ' / ' + data.maxPlayers;
    document.getElementById('displayMode').innerText = data.mode === 'B' ? '2 vs 2' : 'FREE-FOR-ALL';

    const grid = document.getElementById('lobbyGrid');
    grid.innerHTML = data.players.map(p => {
      const isMe = p.id === myId;
      const color = colors[p.playerIndex] || colors[0];
      const teamTag = p.team ? `<span class="team-tag team-${p.team.toLowerCase()}">${p.team}</span>` : '';
      const readyCls = p.ready ? ' ready' : '';
      const meCls = isMe ? ' me' : '';
      return `
        <div class="lobby-player${readyCls}${meCls}">
          <div class="avatar-mini">${generateAvatarHTML(p.avatar)}</div>
          <div style="margin-bottom:4px;">
            <span class="color-dot" style="background:${color.hex}; color:${color.hex};"></span>
            <b>${p.name}</b>${isMe ? ' <small>(Você)</small>' : ''}
          </div>
          <small style="color:var(--cyan-glow);">${p.isHost ? '👑 HOST' : ''}</small>
          <div>${teamTag}</div>
          <small style="color:${p.ready ? 'var(--cyan-glow)' : '#888'};">
            ${p.ready ? '✔ PRONTO' : '⏳ Aguardando'}
          </small>
          ${p.disconnected ? '<div style="color:var(--alert-red);font-size:0.7em;">⚠ Desconectado</div>' : ''}
        </div>
      `;
    }).join('');

    // Botões
    const me = data.players.find(p => p.id === myId);
    const isHost = me && me.isHost;
    const btnReady = document.getElementById('btnReady');
    const btnStart = document.getElementById('btnStartLudo');
    const hint = document.getElementById('readyHint');

    if (me) {
      btnReady.innerText = me.ready ? '✔ PRONTO (cancelar)' : '☐ MARCAR PRONTO';
      btnReady.classList.toggle('active', !!me.ready);
    }

    const allReady = data.players.length >= 2 && data.players.every(p => p.ready);

    if (isHost) {
      btnStart.style.display = 'block';
      btnStart.disabled = !allReady;
    } else {
      btnStart.style.display = 'none';
    }

    if (data.players.length < 2) {
      hint.innerText = 'Aguardando pelo menos 1 jogador entrar...';
    } else if (!allReady) {
      const waiting = data.players.filter(p => !p.ready).length;
      hint.innerText = `Aguardando ${waiting} jogador(es) ficarem prontos...`;
    } else {
      hint.innerText = isHost ? '✅ Todos prontos! Pode iniciar.' : '✅ Todos prontos! Aguardando o host iniciar...';
    }
  });

  // ========== PARTIDA INICIADA ==========
  socket.on('ludoStarted', (state) => {
    roomState = state;
    document.getElementById('setupView').style.display = 'none';
    document.getElementById('lobbyView').style.display = 'none';
    document.getElementById('gameView').style.display = 'block';
    document.getElementById('endView').style.display = 'none';

    buildBoard();
    renderPawns();
    renderPlayersList();
    renderTurnInfo();
    addChatMessage('gameChatBox', 'SISTEMA', 'Partida iniciada!', 'system');
    SOUNDS.turn();
    playBeep(880, 0.2);
  });

  // ========== ESTADO ATUALIZADO ==========
  socket.on('ludoState', (state) => {
    const wasMyTurn = roomState?.currentTurnId === myId;
    roomState = state;

    buildBoard();
    renderPawns();
    renderPlayersList();
    renderTurnInfo();

    // Aviso de turno
    const isMyTurn = state.currentTurnId === myId;
    if (isMyTurn && !wasMyTurn && state.state === 'PLAYING') {
      const flash = document.createElement('div');
      flash.className = 'turn-flash';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 700);
      SOUNDS.turn();
    }
  });

  // ========== TIMER ==========
  socket.on('ludoTimer', (seconds) => {
    const el = document.getElementById('turnTimer');
    if (!el) return;
    el.innerText = seconds;
    el.classList.toggle('urgent', seconds <= 10);
  });

  // ========== DADO ROLADO ==========
  socket.on('ludoDiceRolled', (data) => {
    SOUNDS.dice();
    if (data.playerId === myId && data.anyMove) {
      showToast('🎲 DADO', `Você tirou ${data.dice}! Escolha um peão.`, 'cyan');
    }
  });

  // ========== ROLAR DE NOVO (tirou 6) ==========
  socket.on('ludoRollAgain', (data) => {
    if (data.playerId === myId) {
      showToast('⚅ SEIS!', 'Você joga novamente!', 'gold');
    }
  });

  // ========== CAPTURA ==========
  socket.on('ludoCapture', (data) => {
    SOUNDS.capture();
    const info = document.getElementById('captureInfo');
    if (info && data.captured?.length) {
      info.innerHTML = data.captured.map(c => `💥 <b>${c.playerName}</b> perdeu um peão!`).join('<br>');
      const modal = document.getElementById('captureModal');
      modal.classList.add('open');
      modal.querySelector('.modal-content').classList.add('capture-flash');
      setTimeout(() => {
        modal.querySelector('.modal-content')?.classList.remove('capture-flash');
      }, 700);
    }
  });

  // ========== CHAT ==========
  socket.on('ludoChat', (data) => {
    const box = document.getElementById('gameView').style.display === 'block' ? 'gameChatBox' : 'lobbyChatBox';
    addChatMessage(box, data.sender, data.text, data.type);
    if (data.type !== 'system' && data.type !== 'alert') SOUNDS.chat();
  });

  // ========== JOGADOR SAIU ==========
  socket.on('ludoPlayerLeft', (data) => {
    showToast('👋 SAIU', `${data.playerName} saiu da partida.`, 'zunk');
  });

  // ========== FIM DE JOGO ==========
  socket.on('ludoEnd', (data) => {
    document.getElementById('gameView').style.display = 'none';
    document.getElementById('endView').style.display = 'block';

    const winnerIds = data.winnerIds || [];
    const iWon = winnerIds.includes(myId);
    const title = document.getElementById('endTitle');

    if (roomState?.mode === 'B') {
      const winnerTeam = data.players.find(p => winnerIds.includes(p.id))?.team;
      title.innerText = iWon
        ? `🏆 TIME ${winnerTeam} VENCEU!`
        : `💀 TIME ${winnerTeam} VENCEU`;
    } else {
      const winner = data.players.find(p => p.id === winnerIds[0]);
      title.innerText = iWon ? '🏆 VOCÊ VENCEU!' : `🏆 ${winner?.name || 'ALGUÉM'} VENCEU`;
    }

    if (iWon) {
      spawnConfetti();
      SOUNDS.win();
    } else {
      SOUNDS.lose();
    }

    // Ranking
    const medals = ['🥇', '🥈', '🥉', '4º'];
    const sorted = [...data.players].sort((a, b) => {
      const aFinished = a.pawns.filter(p => p === FINISH_POS).length;
      const bFinished = b.pawns.filter(p => p === FINISH_POS).length;
      return bFinished - aFinished;
    });

    document.getElementById('endRanking').innerHTML = sorted.map((p, i) => {
      const finished = p.pawns.filter(x => x === FINISH_POS).length;
      const teamTag = p.team ? `<span class="end-team team-${p.team.toLowerCase()}">${p.team}</span>` : '';
      return `
        <div class="end-card">
          <div class="medal">${medals[i] || ''}</div>
          <div class="end-name" style="color:${p.color};text-shadow:0 0 10px ${p.color};">
            ${p.id === myId ? '👤 ' : ''}${p.name}
          </div>
          <div>${teamTag}</div>
          <div class="end-progress">${finished} / 4 peões no centro</div>
        </div>
      `;
    }).join('');
  });

  // ========== FALLBACKS ==========
  socket.on('disconnect', () => {
    showToast('⚠️ DESCONECTADO', 'Você perdeu conexão. Recarregue a página.', 'zunk');
  });
}

// ========== INIT ==========
window.addEventListener('DOMContentLoaded', () => {
  // Carrega nome salvo
  const name = getStoredName();
  if (name) {
    const input = document.getElementById('username');
    if (input) input.value = name;
  }
  updatePreview();
  document.getElementById('soundToggle').innerText = soundEnabled ? '🔊' : '🔇';
  document.addEventListener('click', () => initAudio(), { once: true });

  // Enter no chat
  const li = document.getElementById('lobbyChatInput');
  if (li) li.addEventListener('keypress', e => { if (e.key === 'Enter') sendLobbyChat(); });
  const gi = document.getElementById('gameChatInput');
  if (gi) gi.addEventListener('keypress', e => { if (e.key === 'Enter') sendGameChat(); });
});
