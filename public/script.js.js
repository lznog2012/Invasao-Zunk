// ==================================================
// ESTAÇÃO ALPHA - CLIENT
// ==================================================

const socket = typeof io !== 'undefined' ? io() : null;
let myPlayerData = {};
let currentRoomCode = null;
let myVote = null;
let currentPlayers = [];

// ========== PERSISTÊNCIA ==========
const STORAGE = {
  clientId: 'alpha_clientId',
  name: 'alpha_name',
  avatar: 'alpha_avatar',
  history: 'alpha_history',
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

function saveProfile() {
  const nameInput = document.getElementById('username');
  if (nameInput) localStorage.setItem(STORAGE.name, nameInput.value.trim());
  localStorage.setItem(STORAGE.avatar, JSON.stringify(getCustomizationFromUI()));
}

function loadProfile() {
  const name = localStorage.getItem(STORAGE.name);
  if (name) document.getElementById('username').value = name;
  const av = localStorage.getItem(STORAGE.avatar);
  if (av) {
    try {
      const c = JSON.parse(av);
      if (c.facialHair && document.getElementById('optFacialHair')) document.getElementById('optFacialHair').value = c.facialHair;
      if (c.eyewear && document.getElementById('optEyewear')) document.getElementById('optEyewear').value = c.eyewear;
      if (c.suit && document.getElementById('optSuit')) document.getElementById('optSuit').value = c.suit;
      if (c.bg && document.getElementById('optBg')) document.getElementById('optBg').value = c.bg;
    } catch (e) {}
  }
}

// ========== HISTÓRICO ==========
function getHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE.history) || '[]'); } catch (e) { return []; }
}
function addHistory(entry) {
  const h = getHistory();
  h.push(entry);
  if (h.length > 50) h.shift();
  localStorage.setItem(STORAGE.history, JSON.stringify(h));
}
function renderHistoryStats(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const h = getHistory();
  if (!h.length) { el.parentElement.style.display = 'none'; return; }
  el.parentElement.style.display = 'block';
  const total = h.length;
  const wins = h.filter(x => x.won).length;
  const asRimk = h.filter(x => x.myFaction === 'RIMK');
  const asZunk = h.filter(x => x.myFaction === 'ZUNK');
  const winsRimk = asRimk.filter(x => x.won).length;
  const winsZunk = asZunk.filter(x => x.won).length;
  el.innerHTML = `
    <div class="history-stat"><b>${wins}/${total}</b><small>VITÓRIAS</small></div>
    <div class="history-stat"><b>${winsRimk}/${asRimk.length}</b><small>COMO RIMK</small></div>
    <div class="history-stat"><b>${winsZunk}/${asZunk.length}</b><small>COMO ZUNK</small></div>
  `;
}

// ========== SOM ==========
let audioCtx = null;
let soundEnabled = localStorage.getItem(STORAGE.sound) !== 'false';
let ambientOsc = null, ambientGain = null, ambientLfo = null;

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
  eclipse: () => playSequence([[80, 0.5, 'sawtooth', 0.08], [60, 0.8, 'sawtooth', 0.08]]),
  day: () => playSequence([[440, 0.15], [660, 0.2], [880, 0.25]]),
  kill: () => playSequence([[200, 0.1, 'sawtooth', 0.1], [100, 0.3, 'sawtooth', 0.1], [50, 0.5, 'square', 0.1]]),
  eject: () => playSequence([[600, 0.1, 'triangle'], [900, 0.15, 'triangle'], [400, 0.3, 'triangle']]),
  scan: () => playSequence([[1200, 0.05], [1400, 0.05], [1600, 0.05], [1400, 0.05], [1200, 0.1]]),
  confirm: () => playBeep(1000, 0.1, 'sine', 0.08),
  vote: () => playBeep(700, 0.08, 'sine', 0.05),
  victory: () => playSequence([[523, 0.15], [659, 0.15], [784, 0.15], [1047, 0.4]]),
  defeat: () => playSequence([[400, 0.2, 'sawtooth'], [300, 0.2, 'sawtooth'], [200, 0.4, 'sawtooth']]),
  chat: () => playBeep(1500, 0.03, 'sine', 0.03)
};

function startAmbient() {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx || ambientOsc) return;
  try {
    ambientOsc = audioCtx.createOscillator();
    ambientGain = audioCtx.createGain();
    ambientLfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    ambientOsc.type = 'sine';
    ambientOsc.frequency.value = 55;
    ambientGain.gain.value = 0.015;
    ambientLfo.frequency.value = 0.08;
    lfoGain.gain.value = 8;
    ambientLfo.connect(lfoGain);
    lfoGain.connect(ambientOsc.frequency);
    ambientOsc.connect(ambientGain);
    ambientGain.connect(audioCtx.destination);
    ambientOsc.start();
    ambientLfo.start();
  } catch (e) {}
}
function stopAmbient() {
  try { ambientOsc?.stop(); ambientLfo?.stop(); } catch (e) {}
  ambientOsc = null; ambientLfo = null;
}
function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem(STORAGE.sound, soundEnabled);
  document.getElementById('soundToggle').innerText = soundEnabled ? '🔊' : '🔇';
  if (soundEnabled) { initAudio(); startAmbient(); } else stopAmbient();
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
function toggleSidebar() { document.getElementById('guideSidebar').classList.toggle('open'); }
function openManualModal() { document.getElementById('manualModal').classList.add('open'); }
function closeManualModal() { document.getElementById('manualModal').classList.remove('open'); }

function toggleForm(type) {
  const bc = document.getElementById('btnMenuCreate');
  const bj = document.getElementById('btnMenuJoin');
  const fc = document.getElementById('formCreate');
  const fj = document.getElementById('formJoin');
  bc.classList.remove('active'); bj.classList.remove('active');
  fc.style.display = 'none'; fj.style.display = 'none';
  if (type === 'create') { bc.classList.add('active'); fc.style.display = 'block'; }
  else { bj.classList.add('active'); fj.style.display = 'block'; }
}

function generateAvatarHTML(c, extra) {
  if (!c) c = {};
  if (!extra) extra = {};
  let base = 'rimk.png';
  if (extra.isZunkRevealed) base = '2.png';
  const bg = (c.bg && c.bg !== 'none') ? `<img src="images/${c.bg}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;" />` : '';
  const body = `<img src="images/${base}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;z-index:2;" />`;
  const suit = (c.suit && c.suit !== 'none') ? `<img src="images/${c.suit}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;z-index:3;" />` : '';
  const hair = (c.facialHair && c.facialHair !== 'none') ? `<img src="images/${c.facialHair}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;z-index:4;" />` : '';
  const eye = (c.eyewear && c.eyewear !== 'none') ? `<img src="images/${c.eyewear}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;z-index:5;" />` : '';
  return `<div style="position:relative;width:100%;height:100%;aspect-ratio:1/1;overflow:hidden;border-radius:8px;background:#000;">${bg}${body}${suit}${hair}${eye}</div>`;
}

function getCustomizationFromUI() {
  const v = id => document.getElementById(id)?.value || 'none';
  return { facialHair: v('optFacialHair'), eyewear: v('optEyewear'), suit: v('optSuit'), bg: v('optBg') };
}

function updatePreview() {
  const box = document.getElementById('avatarPreview');
  if (box) box.innerHTML = generateAvatarHTML(getCustomizationFromUI());
  saveProfile();
}

// ========== SOCKET LISTENERS ==========
if (socket) {

  socket.on('connect', () => {
    socket.emit('identify', { clientId: CLIENT_ID });
  });

  socket.on('lobbyChatMessage', d => {
    const box = document.getElementById('lobbyChatBox');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'chat-msg';
    el.innerHTML = `<b>${d.sender}:</b> ${d.text}`;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    SOUNDS.chat();
  });

  socket.on('errorMsg', msg => showToast('⚠️ ERRO', msg, 'zunk'));

  socket.on('roomJoined', d => {
    currentRoomCode = d.roomCode;
    myPlayerData.isHost = d.isHost;
    document.getElementById('setupView').style.display = 'none';
    document.getElementById('lobbyView').style.display = 'block';
    document.getElementById('displayRoomCode').innerText = d.roomCode;
    document.getElementById('btnStartMatch').style.display = d.isHost ? 'block' : 'none';
  });

  socket.on('reconnected', d => {
    currentRoomCode = d.roomCode;
    myPlayerData.isHost = d.isHost;
    myPlayerData.roleKey = d.roleKey;
    myPlayerData.role = d.role;
    myPlayerData.faction = d.faction;
    document.getElementById('setupView').style.display = 'none';
    document.getElementById('lobbyView').style.display = d.state === 'LOBBY' ? 'block' : 'none';
    document.getElementById('gameView').style.display = d.state !== 'LOBBY' ? 'flex' : 'none';
    document.getElementById('displayRoomCode').innerText = d.roomCode;
    document.getElementById('btnStartMatch').style.display = d.isHost ? 'block' : 'none';
    document.getElementById('myRole').innerText = d.role || '---';
    document.getElementById('myFaction').innerText = d.faction || '---';
    showToast('🔄 RECONECTADO', `Você voltou para a sala ${d.roomCode}!`, 'cyan');
  });

  socket.on('updateQueue', d => {
    document.getElementById('queueCount').innerText = d.players.length + ' / ' + d.maxPlayers;
    document.getElementById('lobbyQueueGrid').innerHTML = d.players.map(p => {
      const isMe = socket && p.id === socket.id;
      const readyCls = p.ready ? ' ready' : '';
      const meCls = isMe ? ' me' : '';
      const disc = p.disconnected ? '<span class="disconnect-badge">⚠ Off</span>' : '';
      return `<div class="player-card alive${readyCls}${meCls}">
        ${disc}
        <div class="avatar-box">${generateAvatarHTML(p.avatar)}</div>
        <b>${p.name}</b>${isMe ? ' <small style="color:var(--cyan-glow);">(Você)</small>' : ''}<br>
        <small style="color:var(--cyan-glow);">${p.isHost ? '👑 HOST' : ''} ${p.ready ? '✔ PRONTO' : '⏳ Aguardando'}</small>
      </div>`;
    }).join('');

    const me = d.players.find(p => p.id === socket.id);
    if (me) {
      const btn = document.getElementById('btnReady');
      btn.innerText = me.ready ? '✔ PRONTO (clique p/ cancelar)' : '☐ MARCAR PRONTO';
      btn.classList.toggle('active', !!me.ready);
    }
    const allReady = d.players.every(p => p.ready);
    const hostBtn = document.getElementById('btnStartMatch');
    if (myPlayerData.isHost) {
      hostBtn.disabled = !allReady || d.players.length < 5;
      document.getElementById('readyHint').innerText = allReady && d.players.length >= 5
        ? '✅ Todos prontos! Pode iniciar.'
        : `Aguardando ${d.players.filter(p => !p.ready).length} jogador(es) ficarem prontos (mín. 5).`;
    } else {
      document.getElementById('readyHint').innerText = allReady ? '✅ Todos prontos! Aguardando Host iniciar.' : 'Aguardando todos ficarem prontos...';
    }
  });

  socket.on('gameStarted', d => {
    document.getElementById('lobbyView').style.display = 'none';
    document.getElementById('gameView').style.display = 'flex';
    const wasHost = myPlayerData.isHost;
    myPlayerData = { ...d, isHost: wasHost };
    document.getElementById('myRole').innerText = d.role;
    document.getElementById('myFaction').innerText = d.faction;
    document.getElementById('gameOverPanel').classList.remove('open');
    addChatMessage('SISTEMA', 'Missão iniciada! Função atribuída secretamente.', 'system');
    playBeep(880, 0.2);
    startAmbient();
  });

  socket.on('startNight', d => {
    document.getElementById('gameState').innerText = 'ECLIPSE (NOITE ' + d.turn + ')';
    document.getElementById('skipDebateBox').style.display = 'none';
    myVote = null;
    updateChatState(false, '🔒 Chat bloqueado durante o Eclipse.');
    renderGameCards(d.playersList, {});
    renderNightActions(d.playersList);
    addChatMessage('SISTEMA', 'O Eclipse começou. Comunicação bloqueada!', 'system');
    SOUNDS.eclipse();
  });

  socket.on('startDay', d => {
    document.getElementById('gameState').innerText = 'TRANSMISSÃO (DIA)';
    document.getElementById('skipDebateBox').style.display = 'block';
    myVote = null;
    const alive = checkAmIAlive(d.playersList);
    if (alive) updateChatState(true, '💬 Chat aberto para discussão.');
    else updateChatState(true, '👻 Frequência Fantasma (chat dos mortos).', true);
    renderGameCards(d.playersList, d.voteCounts || {});
    if (d.killedPlayer) {
      addChatMessage('SISTEMA', d.killedPlayer + ' foi desintegrado nesta noite!', 'alert');
      showToast('☠️ VÍTIMA DO ECLIPSE', `<b>${d.killedPlayer}</b> foi eliminado.`, 'zunk');
      SOUNDS.kill();
    } else {
      SOUNDS.day();
    }
    renderDayActions(d.playersList);
  });

  socket.on('playersUpdate', d => {
    currentPlayers = d.playersList || currentPlayers;
    renderGameCards(d.playersList || currentPlayers, d.voteCounts || {});
  });

  socket.on('playersUpdated', d => renderGameCards(d.playersList, d.voteCounts || {}));

  socket.on('timerUpdate', seconds => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    const el = document.getElementById('timerDisplay');
    el.innerText = m + ':' + s;
    el.classList.toggle('urgent', seconds <= 10);
  });

  socket.on('updateSkipCount', c => { document.getElementById('skipCount').innerText = c; });

  socket.on('scanResult', r => {
    const t = r.faction === 'INFILTRADO ZUNK' ? 'zunk' : 'cyan';
    showToast('🧪 ESCÂNER BIOLÓGICO', `<b>${r.targetName}</b> pertence à raça <b>${r.faction}</b>!`, t);
    SOUNDS.scan();
  });

  socket.on('actionConfirmed', d => {
    showToast('✅ ALVO CONFIRMADO', `Você escolheu <b>${d.targetName}</b>.`, 'cyan');
    SOUNDS.confirm();
    const panel = document.getElementById('actionPanel');
    if (panel) panel.innerHTML = `<p style="color:var(--gold-yellow);">✅ Ação confirmada em <b>${d.targetName}</b>. Aguardando fim do Eclipse...</p>`;
  });

  socket.on('voteConfirmed', d => {
    SOUNDS.vote();
    const panel = document.getElementById('actionPanel');
    if (panel) panel.innerHTML = `<p style="color:var(--matrix-green);">✅ Voto em <b>${d.targetName}</b> computado! Aguardando os demais...</p>`;
  });

  socket.on('chatMessage', d => {
    addChatMessage(d.sender, d.text, d.type, d.channel);
    if (d.type !== 'system' && d.type !== 'alert') SOUNDS.chat();
    if (d.sender && d.type !== 'system') highlightPlayerCard(d.sender);
  });

  socket.on('ejectionResult', d => {
    if (d.ejectedPlayer) {
      addChatMessage('SISTEMA', d.ejectedPlayer + ' foi ejetado! Raça: ' + d.ejectedFaction, 'alert');
      showToast('🚀 EJEÇÃO', `<b>${d.ejectedPlayer}</b> era <b>${d.ejectedFaction}</b>`, d.ejectedFaction === 'INFILTRADO ZUNK' ? 'zunk' : 'cyan');
      SOUNDS.eject();
      if (d.ejectedPlayerId) {
        const card = document.querySelector(`[data-player-id="${d.ejectedPlayerId}"]`);
        if (card) card.classList.add('ejecting');
      }
    } else {
      addChatMessage('SISTEMA', 'Impasse na votação. Ninguém foi ejetado.', 'system');
      showToast('⚖️ IMPASSE', 'A votação empatou.', 'gold');
    }
    myVote = null;
  });

  socket.on('gameOver', d => {
    document.getElementById('timerDisplay').innerText = '--:--';
    document.getElementById('actionPanel').innerHTML = '<p style="color:var(--gold-yellow);">🏁 Partida encerrada. Confira abaixo!</p>';
    document.getElementById('skipDebateBox').style.display = 'none';

    const panel = document.getElementById('gameOverPanel');
    const title = document.getElementById('gameOverTitle');
    const msg = document.getElementById('gameOverMessage');
    const roster = document.getElementById('finalRoster');
    const hint = document.getElementById('playAgainHint');
    const btn = document.getElementById('btnPlayAgain');

    const isZunk = d.winner === 'ZUNK';
    title.innerText = isZunk ? '👽 VITÓRIA DOS ZUNKS 👽' : '🛸 VITÓRIA DOS RIMKS 🛸';
    title.style.color = isZunk ? 'var(--alert-red)' : 'var(--matrix-green)';
    msg.innerText = d.winnerText;

    roster.innerHTML = (d.allPlayers || []).map(p => {
      const isZ = p.faction === 'ZUNK';
      const cls = isZ ? 'zunk' : 'rimk';
      const dead = p.alive ? '' : ' dead';
      const status = p.alive ? '🟢 Vivo' : '💀 Eliminado';
      const av = generateAvatarHTML(p.avatar, { isZunkRevealed: isZ });
      return `<div class="final-card ${cls}${dead}">
        <div style="width:70px;height:70px;margin:0 auto 6px;border-radius:6px;overflow:hidden;border:1px solid ${isZ ? 'var(--alert-red)' : '#aaff00'};">
          ${av}
        </div>
        <b>${p.name}</b><br>
        <small>${isZ ? '🔴 ZUNK (PELE REVELADA)' : '🟢 RIMK'}</small><br>
        <small>${status}</small>
      </div>`;
    }).join('');

    panel.classList.add('open');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    updateChatState(true, '💬 Chat liberado para comentar!', false);

    if (socket && myPlayerData?.isHost) {
      btn.style.display = 'inline-block';
      hint.innerText = 'Você é o Host. Clique para reiniciar com os mesmos jogadores.';
    } else {
      btn.style.display = 'none';
      hint.innerText = 'Aguarde o Host iniciar uma nova rodada...';
    }

    // Registra no histórico
    const won = (myPlayerData.faction === 'ZUNK' && isZunk) || (myPlayerData.faction === 'RIMK' && !isZunk);
    addHistory({ won, myFaction: myPlayerData.faction, date: Date.now(), winner: d.winner });
    renderHistoryStats('matchHistoryStats');

    addChatMessage('SISTEMA', d.winnerText, 'alert');
    showToast(isZunk ? '👽 ZUNKS VENCERAM' : '🛸 RIMKS VENCERAM', 'Confira o resultado abaixo.', isZunk ? 'zunk' : 'gold');
    if (won) SOUNDS.victory(); else SOUNDS.defeat();
  });

  socket.on('gameRestarted', d => {
    document.getElementById('gameOverPanel').classList.remove('open');
    document.getElementById('chatBox').innerHTML = '';
    document.getElementById('finalRoster').innerHTML = '';
    addChatMessage('SISTEMA', 'Nova partida iniciando...', 'system');
    showToast('🔄 NOVA PARTIDA', 'Papéis sendo redistribuídos...', 'cyan');
    playBeep(440, 0.3);
  });
}

// ========== CHAT / ESTADO ==========
function addChatMessage(sender, text, type, channel) {
  const box = document.getElementById('chatBox');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'chat-msg' + (type ? ' ' + type : '');
  if (type === 'system') el.innerHTML = `🤖 <b>[SISTEMA]:</b> ${text}`;
  else if (type === 'alert') el.innerHTML = `⚠️ <b>[ALERTA]:</b> ${text}`;
  else if (type === 'dead') el.innerHTML = `👻 <b>${sender} (Fantasma):</b> ${text}`;
  else el.innerHTML = `<b>${sender}:</b> ${text}`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

function highlightPlayerCard(name) {
  const card = [...document.querySelectorAll('.player-card')].find(c => c.querySelector('b')?.innerText === name);
  if (card) {
    card.classList.add('highlight');
    setTimeout(() => card.classList.remove('highlight'), 2000);
  }
}

function updateChatState(enabled, noticeText, isGhost) {
  const input = document.getElementById('chatInput');
  const btn = document.getElementById('btnSendChat');
  const notice = document.getElementById('chatStatusNotice');
  const title = document.getElementById('chatTitle');
  if (input) input.disabled = !enabled;
  if (btn) btn.disabled = !enabled;
  if (notice) notice.innerText = noticeText || '';
  if (title) {
    if (isGhost) {
      title.innerText = '👻 FREQUÊNCIA FANTASMA';
      title.style.color = 'var(--ghost-purple)';
    } else {
      title.innerText = 'COMUNICAÇÃO DE BORDO';
      title.style.color = 'var(--matrix-green)';
    }
  }
}

function checkAmIAlive(players) {
  if (!socket) return false;
  const me = players.find(p => p.id === socket.id);
  return me ? me.alive : false;
}