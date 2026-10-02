// ==================================================
// ESTAÇÃO ALPHA - HOME
// ==================================================

const socket = typeof io !== 'undefined' ? io() : null;

const STORAGE = {
  clientId: 'alpha_clientId',
  name: 'alpha_name',
  avatar: 'alpha_avatar',
  race: 'alpha_race'
};

// ========== MAPA DE RAÇAS ==========
const RACE_FILES = {
  'Rimk':   'rimk.png',
  'Sahrin': 'sahrin.png',
  'Ferrum': 'ferrum.png',
  'Nereid': 'nereid.png'
};

const DEFAULT_RACE = 'Rimk';

// ========== CLIENT ID ==========
function getClientId() {
  let id = localStorage.getItem(STORAGE.clientId);
  if (!id) {
    id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(STORAGE.clientId, id);
  }
  return id;
}
const CLIENT_ID = getClientId();

// ========== PERFIL ==========
function getProfile() {
  return {
    name: localStorage.getItem(STORAGE.name) || '',
    race: localStorage.getItem(STORAGE.race) || DEFAULT_RACE,
    avatar: (() => {
      try { return JSON.parse(localStorage.getItem(STORAGE.avatar) || '{}'); }
      catch (e) { return {}; }
    })()
  };
}

function renderProfileCorner() {
  const p = getProfile();
  const nameEl = document.getElementById('profileName');
  const avatarEl = document.getElementById('profileAvatar');
  if (!nameEl || !avatarEl) return;

  if (p.name) {
    nameEl.innerText = p.name;
    nameEl.classList.remove('empty');
  } else {
    nameEl.innerText = 'Definir perfil';
    nameEl.classList.add('empty');
  }

  avatarEl.innerHTML = generateMiniAvatar(p.avatar, p.race);
}

// ========== GERADOR DE AVATAR ==========
// Camadas: fundo → cabeça (raça) → traje → acessório
function generateMiniAvatar(c, race) {
  if (!c) c = {};
  if (!race) race = DEFAULT_RACE;

  const raceFile = RACE_FILES[race] || RACE_FILES[DEFAULT_RACE];

  const bg = (c.bg && c.bg !== 'none')
    ? `<img src="images/${c.bg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;" />`
    : '';

  const head = `<img src="images/${raceFile}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:2;" />`;

  const suit = (c.suit && c.suit !== 'none')
    ? `<img src="images/${c.suit}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:3;" />`
    : '';

  const eyewear = (c.eyewear && c.eyewear !== 'none')
    ? `<img src="images/${c.eyewear}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:4;" />`
    : '';

  return `<div style="position:relative;width:100%;height:100%;background:#000;">${bg}${head}${suit}${eyewear}</div>`;
}

// ========== MODAL DE PERFIL ==========
function getModalCustomization() {
  const v = id => {
    const el = document.getElementById(id);
    return el ? (el.value || 'none') : 'none';
  };
  const raceEl = document.querySelector('.race-option.selected');
  const race = raceEl ? raceEl.dataset.race : DEFAULT_RACE;

  return {
    race,
    eyewear: v('modalOptEyewear'),
    suit: v('modalOptSuit'),
    bg: v('modalOptBg')
  };
}

function setModalCustomization(c) {
  if (!c) c = {};
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || 'none';
  };
  set('modalOptEyewear', c.eyewear);
  set('modalOptSuit', c.suit);
  set('modalOptBg', c.bg);

  // Marca a raça selecionada
  const race = c.race || DEFAULT_RACE;
  document.querySelectorAll('.race-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.race === race);
  });
}

function selectRace(race) {
  document.querySelectorAll('.race-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.race === race);
  });
  updateModalPreview();
}

function updateModalPreview() {
  const box = document.getElementById('modalAvatarPreview');
  if (!box) return;
  const c = getModalCustomization();
  box.innerHTML = generateMiniAvatar(c, c.race);
}

function openProfileModal() {
  const p = getProfile();
  const input = document.getElementById('modalUsername');
  if (input) input.value = p.name || '';

  // Combina a raça salva com o avatar salvo
  setModalCustomization({ ...p.avatar, race: p.race });
  updateModalPreview();

  // Mostra histórico se tiver
  const statsBox = document.getElementById('profileHistoryStats');
  const statsBoxContainer = document.getElementById('profileHistoryBox');
  if (statsBox && statsBoxContainer) {
    let h = [];
    try { h = JSON.parse(localStorage.getItem('alpha_history') || '[]'); } catch (e) {}
    if (h.length) {
      statsBoxContainer.style.display = 'block';
      renderProfileHistory(statsBox, h);
    } else {
      statsBoxContainer.style.display = 'none';
    }
  }

  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.add('open');
}

function renderProfileHistory(el, h) {
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

function closeProfileModal() {
  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.remove('open');
}

function saveProfileFromModal() {
  const input = document.getElementById('modalUsername');
  if (!input) return;
  const name = input.value.trim();
  if (!name) {
    alert('Por favor, digite um nome!');
    return;
  }
  const custom = getModalCustomization();
  localStorage.setItem(STORAGE.name, name);
  localStorage.setItem(STORAGE.race, custom.race);
  localStorage.setItem(STORAGE.avatar, JSON.stringify({
    eyewear: custom.eyewear,
    suit: custom.suit,
    bg: custom.bg
  }));
  renderProfileCorner();
  closeProfileModal();
}

// ========== SOCKET: STATUS BAR ==========
if (socket) {
  socket.on('connect', () => {
    socket.emit('identify', { clientId: CLIENT_ID });
    socket.emit('requestStats');
  });

  socket.on('statsUpdate', (data) => {
    const onlineEl = document.getElementById('onlineCount');
    const roomsEl = document.getElementById('activeRooms');
    if (onlineEl) onlineEl.innerText = data.onlinePlayers ?? 0;
    if (roomsEl) roomsEl.innerText = data.activeRooms ?? 0;
  });
}

// ========== INIT ==========
window.addEventListener('DOMContentLoaded', () => {
  renderProfileCorner();

  // Enter no modal salva
  const input = document.getElementById('modalUsername');
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') saveProfileFromModal();
    });
  }

  // Clica fora do modal fecha
  const modal = document.getElementById('profileModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeProfileModal();
    });
  }

  // Atualiza preview do avatar sempre que mudar os selects
  ['modalOptEyewear', 'modalOptSuit', 'modalOptBg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateModalPreview);
  });

  // Preview inicial (mesmo fechado, pra estar pronto ao abrir)
  updateModalPreview();
});

// ============================================
// INTRO CINEMATOGRÁFICA (só na 1ª visita)
// ============================================
const INTRO_KEY = 'alpha_intro_seen';

function skipIntro() {
  const intro = document.getElementById('loreIntro');
  if (!intro) return;
  intro.classList.add('hidden');
  localStorage.setItem(INTRO_KEY, 'true');
  setTimeout(() => intro.remove(), 900);
}

function autoCloseIntro() {
  setTimeout(() => {
    if (document.getElementById('loreIntro')) skipIntro();
  }, 11000);
}

window.addEventListener('DOMContentLoaded', () => {
  const intro = document.getElementById('loreIntro');
  if (!intro) return;

  const jaViu = localStorage.getItem(INTRO_KEY) === 'true';

  if (jaViu) {
    intro.remove();
  } else {
    autoCloseIntro();
  }
});
