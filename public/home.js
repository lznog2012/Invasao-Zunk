// ==================================================
// ESTAÇÃO ALPHA - HOME
// ==================================================

const socket = typeof io !== 'undefined' ? io() : null;

const STORAGE = {
  clientId: 'alpha_clientId',
  name: 'alpha_name',
  avatar: 'alpha_avatar'
};

// ========== CLIENT ID (compartilhado com os jogos) ==========
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

  avatarEl.innerHTML = generateMiniAvatar(p.avatar);
}

function generateMiniAvatar(c) {
  if (!c) c = {};
  const bg = (c.bg && c.bg !== 'none') ? `<img src="images/${c.bg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;" />` : '';
  const body = `<img src="images/rimk.png" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:2;" />`;
  const suit = (c.suit && c.suit !== 'none') ? `<img src="images/${c.suit}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:3;" />` : '';
  const hair = (c.facialHair && c.facialHair !== 'none') ? `<img src="images/${c.facialHair}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:4;" />` : '';
  const eye = (c.eyewear && c.eyewear !== 'none') ? `<img src="images/${c.eyewear}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:5;" />` : '';
  return `<div style="position:relative;width:100%;height:100%;background:#000;">${bg}${body}${suit}${hair}${eye}</div>`;
}

// ========== MODAL DE PERFIL ==========
function openProfileModal() {
  const p = getProfile();
  const input = document.getElementById('modalUsername');
  if (input) input.value = p.name || '';
  document.getElementById('profileModal').classList.add('open');
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.remove('open');
}

function saveProfileFromModal() {
  const input = document.getElementById('modalUsername');
  if (!input) return;
  const name = input.value.trim();
  if (!name) {
    alert('Por favor, digite um nome!');
    return;
  }
  localStorage.setItem(STORAGE.name, name);
  renderProfileCorner();
  closeProfileModal();
}

// ========== AVISOS ==========
function mostrarEmBreve(nome) {
  alert(`🚧 ${nome}\n\nEste jogo está em construção. Em breve estará disponível!`);
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
});
