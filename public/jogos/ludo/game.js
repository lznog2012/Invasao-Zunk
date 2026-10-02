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
function buildBoard() {
  const board = document.getElementById('ludoBoard');
  if (!board) return;
  board.innerHTML = '';

  // Cria grid vazio 15x15
  const grid = {};
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      grid[`${r}-${c}`] = null;
    }
  }

  // Marca bases
  const basePositions = [
    { r0: 0, c0: 0, colorIdx: 0 },   // top-left  = jogador 0
    { r0: 0, c0: 9, colorIdx: 1 },   // top-right = jogador 1
    { r0: 9, c0: 9, colorIdx: 2 },   // bot-right = jogador 2
    { r0: 9, c0: 0, colorIdx: 3 }    // bot-left  = jogador 3
  ];
  basePositions.forEach(b => {
    for (let r = b.r0; r < b.r0 + 6; r++) {
      for (let c = b.c0; c < b.c0 + 6; c++) {
        grid[`${r}-${c}`] = { type: 'base', colorIdx: b.colorIdx };
      }
    }
  });

  // Marca caminho
  PATH.forEach((p, i) => {
    grid[`${p[0]}-${p[1]}`] = {
      type: 'path',
      idx: i,
      safe: SAFE_INDICES.has(i)
    };
  });

  // Marca colunas finais
  HOME_COLUMNS.forEach((col, playerIdx) => {
    col.forEach((pos, i) => {
      grid[`${pos[0]}-${pos[1]}`] = {
        type: 'home-col',
        colorIdx: playerIdx,
        idx: i
      };
    });
  });

  // Marca centro
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
          const colors = getColorsForMode();
          cell.style.background = hexWithAlpha(colors[cellData.colorIdx].hex, 0.15);
        } else if (cellData.type === 'path') {
          cell.classList.add('path');
          if (cellData.safe) cell.classList.add('safe');
          cell.dataset.pathIdx = cellData.idx;
        } else if (cellData.type === 'home-col') {
          cell.classList.add('home-col');
          const colors = getColorsForMode();
          cell.style.background = hexWithAlpha(colors[cellData.colorIdx].hex, 0.35);
          cell.style.borderColor = colors[cellData.colorIdx].hex;
        } else if (cellData.type === 'center') {
          cell.classList.add('center');
        }
      } else {
        // Células "mortas" — só apaga
        cell.style.background = 'transparent';
      }

      board.appendChild(cell);
    }
  }

  // Renderiza peões por cima
  renderPawns();
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
function renderPawns() {
  // Remove peões antigos
  document.querySelectorAll('.pawn').forEach(p => p.remove());
  document.querySelectorAll('.cell.multi').forEach(c => c.classList.remove('multi'));

  if (!roomState || !roomState.players) return;

  const colors = getColorsForMode();
  const currentTurnId = roomState.currentTurnId;
  const myTurn = currentTurnId === myId;
  const dice = roomState.dice;

  // Agrupa peões por célula
  const cellPawns = {};

  roomState.players.forEach(player => {
    if (player.eliminated) return;
    player.pawns.forEach((pos, pawnIdx) => {
      let coords;
      if (pos === -1) {
        // Na base
        coords = BASE_POSITIONS[player.playerIndex][pawnIdx];
      } else if (pos >= 0 && pos <= 50) {
        // No anel
        const ringIdx = getRingIndex(player.playerIndex, pos);
        coords = PATH[ringIdx];
      } else if (pos >= 51 && pos <= 55) {
        // Coluna final
        const homeIdx = pos - 51;
        coords = HOME_COLUMNS[player.playerIndex][homeIdx];
      } else if (pos === 56) {
        // Chegou — fica no centro
        coords = CENTER;
      } else {
        return;
      }

      const key = `${coords[0]}-${coords[1]}`;
      if (!cellPawns[key]) cellPawns[key] = [];
      cellPawns[key].push({ player, pawnIdx, pos });
    });
  });

  // Renderiza em cada célula
  Object.entries(cellPawns).forEach(([key, pawns]) => {
    const [r, c] = key.split('-').map(Number);
    const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
    if (!cell) return;

    if (pawns.length > 1) cell.classList.add('multi');

    pawns.forEach(({ player, pawnIdx, pos }, i) => {
      const color = colors[player.playerIndex] || colors[0];
      const pawnEl = document.createElement('div');
      pawnEl.className = 'pawn';
      pawnEl.style.background = color.hex;
      pawnEl.style.color = color.hex;
      pawnEl.dataset.playerId = player.id;
      pawnEl.dataset.pawnIdx = pawnIdx;

      // Se for minha vez, dado rolado, e este peão pode mover
      const isMyPawn = player.id === myId;
      if (isMyPawn && myTurn && dice !== null && canMovePawn(pos, dice)) {
        pawnEl.classList.add('movable');
        pawnEl.onclick = (e) => {
          e.stopPropagation();
          movePawn(pawnIdx);
        };
      }

      cell.appendChild(pawnEl);
    });
  });
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
