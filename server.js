const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function assignRoles(room) {
  const playerIds = Object.keys(room.players);
  const count = playerIds.length;
  let rolesPool = [];

  if (count <= 5) {
    const specialRole = Math.random() < 0.5 ? 'BIOLOGIST' : 'SHIELD_ENGINEER';
    rolesPool = ['ZUNK', specialRole, 'RIMK_CREW', 'RIMK_CREW', 'RIMK_CREW'];
  } else if (count === 6) {
    rolesPool = ['ZUNK', 'BIOLOGIST', 'SHIELD_ENGINEER', 'RIMK_CREW', 'RIMK_CREW', 'RIMK_CREW'];
  } else {
    rolesPool = ['ZUNK', 'ZUNK', 'BIOLOGIST', 'SHIELD_ENGINEER', 'RIMK_CREW', 'RIMK_CREW', 'RIMK_CREW'];
  }

  for (let i = rolesPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rolesPool[i], rolesPool[j]] = [rolesPool[j], rolesPool[i]];
  }

  playerIds.forEach((id, index) => {
    const role = rolesPool[index] || 'RIMK_CREW';
    room.players[id].role = role;
    room.players[id].faction = role === 'ZUNK' ? 'ZUNK' : 'RIMK';
    room.players[id].alive = true;
  });
}

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Estação Alpha - Rimks vs Zunks</title>
      <style>
        :root {
          --matrix-green: #00ff66;
          --matrix-dark-green: #003311;
          --bg-color: #030708;
          --card-bg: #0a1114;
          --alert-red: #ff3366;
        }

        * { box-sizing: border-box; font-family: 'Courier New', Courier, monospace; }
        body { background-color: var(--bg-color); color: var(--matrix-green); margin: 0; padding: 15px; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
        
        h1, h2, h3, h4 { text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 0 8px var(--matrix-green); margin: 5px 0; }
        
        .container { width: 100%; max-width: 1100px; display: flex; flex-direction: column; gap: 15px; }
        .panel { background: var(--card-bg); border: 1px solid var(--matrix-green); border-radius: 8px; padding: 15px; box-shadow: 0 0 15px rgba(0, 255, 102, 0.15); }
        
        .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 15px; margin-top: 15px; }
        .player-card { background: #050d0f; border: 1px solid #005522; border-radius: 8px; padding: 10px; text-align: center; position: relative; }
        .player-card.alive { border-color: var(--matrix-green); box-shadow: 0 0 8px rgba(0, 255, 102, 0.2); }
        .player-card.dead { border-color: var(--alert-red); opacity: 0.6; filter: grayscale(80%); }
        
        .avatar-box { width: 90px; height: 90px; margin: 0 auto 8px auto; background: #020506; border-radius: 50%; border: 1px solid var(--matrix-green); display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .avatar-box svg { width: 80px; height: 80px; }

        .customizer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 10px 0; }
        select, input[type="text"], input[type="number"] { background: #001100; border: 1px solid var(--matrix-green); color: var(--matrix-green); padding: 10px; width: 100%; border-radius: 4px; font-size: 1em; }
        
        button { background: var(--matrix-dark-green); color: var(--matrix-green); border: 1px solid var(--matrix-green); padding: 12px 15px; font-weight: bold; cursor: pointer; text-transform: uppercase; border-radius: 4px; transition: 0.2s; font-size: 1.1em; }
        button:hover { background: var(--matrix-green); color: #000; box-shadow: 0 0 12px var(--matrix-green); }
        
        .code-display { font-size: 2.2em; color: #ffff00; text-shadow: 0 0 12px #ffff00; letter-spacing: 5px; font-weight: bold; }
        
        .game-layout { display: grid; grid-template-columns: 2fr 1fr; gap: 15px; }
        @media (max-width: 768px) { .game-layout { grid-template-columns: 1fr; } }

        .chat-box { height: 250px; background: #020506; border: 1px solid #004411; border-radius: 4px; padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; font-size: 0.9em; }
        .chat-msg { margin: 2px 0; word-break: break-word; }
        .chat-msg.system { color: #ffff00; font-style: italic; }
        .chat-msg.alert { color: var(--alert-red); }

        .timer-badge { font-size: 1.4em; color: #ffff00; text-shadow: 0 0 10px #ffff00; font-weight: bold; }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-top: 4px; }
        .badge-rimk { background: #224400; color: #aaff00; border: 1px solid #aaff00; }
        .badge-zunk { background: #444444; color: #ffffff; border: 1px solid #ffffff; }

        .action-menu { display: flex; gap: 15px; margin-bottom: 20px; }
        .action-menu button { flex: 1; padding: 15px; font-size: 1.2em; background: #002211; border: 2px solid var(--matrix-green); }
        .action-menu button:hover, .action-menu button.active { background: var(--matrix-green); color: #000; }
        
        .hidden-form { display: none; background: #020805; padding: 20px; border: 1px dashed var(--matrix-green); border-radius: 8px; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div style="text-align: center;">
          <h1>🛸 ESTAÇÃO ALPHA 🛸</h1>
          <p style="color: #00aa44; margin: 0;">SISTEMA DE SEGURANÇA E DEDUÇÃO EMBARCADO</p>
        </div>

        <!-- TELA 1: CADASTRO E NAVEGAÇÃO PROGRESSIVA -->
        <div id="setupView" class="panel">
          <h3>[ 1. REGISTRO DE TRIPULANTE ]</h3>
          <div style="display: grid; grid-template-columns: 140px 1fr; gap: 20px; align-items: center;">
            <div style="text-align: center;">
              <div class="avatar-box" id="avatarPreview"></div>
              <small>Prévia</small>
            </div>
            <div>
              <label>Nome do Tripulante:</label>
              <input type="text" id="username" placeholder="Digite seu apelido..." style="margin-bottom: 10px;">
              
              <div class="customizer-grid">
                <div>
                  <label>Pele:</label>
                  <select id="optSkin" onchange="updatePreview()">
                    <option value="#55aa66">Grey Esverdeado</option>
                    <option value="#88bb44">Grey Amarelado</option>
                    <option value="#dddddd">Grey Pálido</option>
                  </select>
                </div>
                <div>
                  <label>Bigode:</label>
                  <select id="optMoustache" onchange="updatePreview()">
                    <option value="none">Nenhum</option>
                    <option value="classic">Clássico</option>
                    <option value="handlebar">Imperial</option>
                  </select>
                </div>
                <div>
                  <label>Óculos:</label>
                  <select id="optGlasses" onchange="updatePreview()">
                    <option value="none">Nenhum</option>
                    <option value="visor">Visor Cyber</option>
                    <option value="monocle">Monóculo</option>
                  </select>
                </div>
                <div>
                  <label>Chapéu:</label>
                  <select id="optHat" onchange="updatePreview()">
                    <option value="none">Nenhum</option>
                    <option value="cap">Quepe Oficial</option>
                    <option value="antenna">Antena</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <hr style="border-color: #003311; margin: 25px 0;">

          <h3>[ 2. ACESSO À ESTAÇÃO ]</h3>
          <!-- Botões Principais -->
          <div class="action-menu">
            <button id="btnMenuCreate" onclick="toggleForm('create')">➕ CRIAR SALA (HOST)</button>
            <button id="btnMenuJoin" onclick="toggleForm('join')">🚪 ENTRAR EM SALA EXISTENTE</button>
          </div>

          <!-- Formulário Oculto: CONFIGURAR SALA -->
          <div id="formCreate" class="hidden-form">
            <h4 style="margin-top:0;">⚙️️ PARÂMETROS DA NOVA PARTIDA</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
              <div>
                <label>Máximo de Jogadores:</label>
                <select id="maxPlayersInput">
                  <option value="5">5 Jogadores</option>
                  <option value="6">6 Jogadores</option>
                  <option value="7">7 Jogadores</option>
                </select>
              </div>
              <div>
                <label>Tempo de Discussão (Segundos):</label>
                <input type="number" id="debateTimeInput" value="300" min="60" max="600">
              </div>
            </div>
            <p style="font-size: 0.9em; color: #00aa44;">* Após gerar a sala, você receberá um código para enviar aos outros jogadores.</p>
            <button onclick="createRoom()" style="width: 100%; background: #005522;">GERAR CÓDIGO DA SALA</button>
          </div>

          <!-- Formulário Oculto: ENTRAR NA SALA -->
          <div id="formJoin" class="hidden-form">
            <h4 style="margin-top:0;">📡 INSERIR CÓDIGO DE ACESSO</h4>
            <label>Código da Sala (4 Dígitos):</label>
            <input type="text" id="roomCodeInput" placeholder="EX: A8F3" style="text-transform: uppercase; font-size: 1.5em; text-align: center; letter-spacing: 5px; margin: 10px 0;">
            <button onclick="joinRoom()" style="width: 100%; background: #003366; border-color: #0088cc;">CONECTAR À FILA</button>
          </div>
        </div>

        <!-- TELA 2: FILA DE ESPERA (LOBBY) -->
        <div id="lobbyView" class="panel" style="display:none;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
            <div>
              <h3>CÓDIGO DA SALA: <span class="code-display" id="displayRoomCode">----</span></h3>
              <p style="color:#00ffcc; margin: 0;">Envie este código para os tripulantes entrarem na fila!</p>
            </div>
            <div>
              <h4>NA FILA: <span id="queueCount">0 / 0</span></h4>
            </div>
          </div>

          <hr style="border-color: #003311; margin: 15px 0;">

          <div id="lobbyQueueGrid" class="cards-grid"></div>

          <div id="hostControls" style="margin-top: 20px; display: none;">
            <button onclick="startMatch()" style="width: 100%; background: #008833; font-size: 1.2em;">🚀 INICIAR PARTIDA (SOMENTE HOST)</button>
          </div>
        </div>

        <!-- TELA 3: TELA DE JOGO -->
        <div id="gameView" class="container" style="display:none;">
          <div class="panel" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
            <div><span>SEU PAPEL: <b id="myRole" style="color:#fff;">---</b> (<span id="myFaction">---</span>)</span></div>
            <div><span>FASE: <b id="gameState">ECLIPSE</b></span></div>
            <div><span class="timer-badge" id="timerDisplay">05:00</span></div>
          </div>

          <div class="game-layout">
            <div>
              <div class="panel">
                <h3>TRIPULAÇÃO DA ESTAÇÃO</h3>
                <div id="gameCardsGrid" class="cards-grid"></div>
              </div>

              <div class="panel" style="margin-top: 15px;">
                <h3>PAINEL DE COMANDO</h3>
                <div id="actionPanel"><p>Aguardando...</p></div>
                <div id="skipDebateBox" style="margin-top: 10px; display: none;">
                  <button onclick="voteSkipDebate()" style="background: #aa6600; width: 100%;">
                    ⚡ AVANÇAR DEBATE (<span id="skipCount">0</span> Votos)
                  </button>
                </div>
              </div>
            </div>

            <div class="panel" style="display: flex; flex-direction: column; justify-content: space-between;">
              <h3>COMUNICAÇÃO DE BORDO</h3>
              <div id="chatBox" class="chat-box"></div>
              <div style="display: flex; gap: 5px; margin-top: 10px;">
                <input type="text" id="chatInput" placeholder="Mensagem..." onkeypress="if(event.key==='Enter') sendChat()">
                <button onclick="sendChat()">ENVIAR</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        let myPlayerData = {};
        let currentRoomCode = null;

        // --- SISTEMA DE UI PROGRESSIVA ---
        function toggleForm(type) {
          document.getElementById('btnMenuCreate').classList.remove('active');
          document.getElementById('btnMenuJoin').classList.remove('active');
          document.getElementById('formCreate').style.display = 'none';
          document.getElementById('formJoin').style.display = 'none';

          if (type === 'create') {
            document.getElementById('btnMenuCreate').classList.add('active');
            document.getElementById('formCreate').style.display = 'block';
          } else {
            document.getElementById('btnMenuJoin').classList.add('active');
            document.getElementById('formJoin').style.display = 'block';
          }
        }

        // --- AVATAR E CORE ---
        function generateAvatarSVG(c) {
          if (!c) c = {};
          const skin = c.skin || '#55aa66';
          let m = '', g = '', h = '';
          
          if (c.moustache === 'classic') m = '<path d="M 35 62 Q 50 55 65 62 Q 75 70 80 62 Q 65 68 50 66 Q 35 68 20 62 Q 25 70 35 62 Z" fill="#111" />';
          else if (c.moustache === 'handlebar') m = '<path d="M 30 60 Q 50 50 70 60 Q 85 50 80 65 Q 65 60 50 64 Q 35 60 20 65 Q 15 50 30 60 Z" fill="#221100" />';

          if (c.glasses === 'visor') g = '<rect x="20" y="38" width="60" height="14" rx="4" fill="#00ffff" opacity="0.8"/>';
          else if (c.glasses === 'monocle') g = '<circle cx="35" cy="45" r="10" fill="none" stroke="#ffaa00" stroke-width="2"/><line x1="35" y1="55" x2="40" y2="70" stroke="#ffaa00" stroke-width="2"/>';

          if (c.hat === 'cap') h = '<path d="M 15 28 Q 50 10 85 28 L 90 32 L 10 32 Z" fill="#003366"/><rect x="10" y="30" width="80" height="4" fill="#ffcc00"/>';
          else if (c.hat === 'antenna') h = '<line x1="50" y1="20" x2="50" y2="2" stroke="#00ff66" stroke-width="3"/><circle cx="50" cy="2" r="5" fill="#00ff66"/>';

          return '<svg viewBox="0 0 100 100">' +
            '<path d="M 50 15 C 20 15 15 40 25 65 C 32 82 45 92 50 92 C 55 92 68 82 75 65 C 85 40 80 15 50 15 Z" fill="' + skin + '" />' +
            '<ellipse cx="35" cy="45" rx="10" ry="14" fill="#050505" transform="rotate(-12 35 45)"/>' +
            '<ellipse cx="65" cy="45" rx="10" ry="14" fill="#050505" transform="rotate(12 65 45)"/>' +
            '<ellipse cx="33" cy="42" rx="3" ry="5" fill="#ffffff" opacity="0.7"/>' +
            '<ellipse cx="63" cy="42" rx="3" ry="5" fill="#ffffff" opacity="0.7"/>' +
            m + g + h +
          '</svg>';
        }

        function getCustomizationFromUI() {
          return {
            skin: document.getElementById('optSkin').value,
            moustache: document.getElementById('optMoustache').value,
            glasses: document.getElementById('optGlasses').value,
            hat: document.getElementById('optHat').value
          };
        }

        function updatePreview() { document.getElementById('avatarPreview').innerHTML = generateAvatarSVG(getCustomizationFromUI()); }
        window.onload = () => { updatePreview(); };

        function createRoom() {
          const name = document.getElementById('username').value.trim();
          if (!name) return alert('Por favor, digite seu nome de tripulante!');
          
          const maxPlayers = parseInt(document.getElementById('maxPlayersInput').value);
          const debateTime = parseInt(document.getElementById('debateTimeInput').value);
          
          socket.emit('createRoom', { name, avatar: getCustomizationFromUI(), maxPlayers, debateTime });
        }

        function joinRoom() {
          const name = document.getElementById('username').value.trim();
          if (!name) return alert('Por favor, digite seu nome!');
          const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
          if (!roomCode) return alert('Digite o código da sala!');

          socket.emit('joinRoom', { name, avatar: getCustomizationFromUI(), roomCode });
        }

        function startMatch() { if (currentRoomCode) socket.emit('startGame', { roomCode: currentRoomCode }); }
        function voteSkipDebate() { if (currentRoomCode) socket.emit('voteSkipDebate', { roomCode: currentRoomCode }); }

        socket.on('errorMsg', (msg) => { alert('⚠️ ' + msg); });

        socket.on('roomJoined', (data) => {
          currentRoomCode = data.roomCode;
          document.getElementById('setupView').style.display = 'none';
          document.getElementById('lobbyView').style.display = 'block';
          document.getElementById('displayRoomCode').innerText = data.roomCode;
          document.getElementById('hostControls').style.display = data.isHost ? 'block' : 'none';
        });

        socket.on('updateQueue', (data) => {
          document.getElementById('queueCount').innerText = data.players.length + ' / ' + data.maxPlayers;
          document.getElementById('lobbyQueueGrid').innerHTML = data.players.map(p => 
            '<div class="player-card alive">' +
              '<div class="avatar-box">' + generateAvatarSVG(p.avatar) + '</div>' +
              '<b>' + p.name + '</b><br><small>' + (p.isHost ? '👑 HOST' : '🟢 Fila') + '</small>' +
            '</div>'
          ).join('');
        });

        socket.on('gameStarted', (data) => {
          document.getElementById('lobbyView').style.display = 'none';
          document.getElementById('gameView').style.display = 'flex';
          myPlayerData = data;
          document.getElementById('myRole').innerText = data.role;
          document.getElementById('myFaction').innerText = data.faction;
          addChatMessage('SISTEMA', 'Missão iniciada! Identidades distribuídas.', 'system');
        });

        socket.on('startNight', (data) => {
          document.getElementById('gameState').innerText = 'ECLIPSE (NOITE ' + data.turn + ')';
          document.getElementById('skipDebateBox').style.display = 'none';
          renderGameCards(data.playersList);
          renderNightActions(data.playersList);
          addChatMessage('SISTEMA', 'O Eclipse começou. Ações ocultas ativadas.', 'system');
        });

        socket.on('startDay', (data) => {
          document.getElementById('gameState').innerText = 'TRANSMISSÃO (DIA)';
          document.getElementById('skipDebateBox').style.display = 'block';
          renderGameCards(data.playersList);
          if (data.killedPlayer) addChatMessage('SISTEMA', data.killedPlayer + ' foi desintegrado nesta noite!', 'alert');
          renderDayActions(data.playersList);
        });

        socket.on('timerUpdate', (seconds) => {
          const m = Math.floor(seconds / 60).toString().padStart(2, '0');
          const s = (seconds % 60).toString().padStart(2, '0');
          document.getElementById('timerDisplay').innerText = m + ':' + s;
        });

        socket.on('updateSkipCount', (count) => { document.getElementById('skipCount').innerText = count; });
        socket.on('scanResult', (res) => { alert('[ESCÂNER]: ' + res.targetName + ' é da raça ' + res.faction); });
        socket.on('chatMessage', (data) => { addChatMessage(data.sender, data.text, data.type); });

        socket.on('ejectionResult', (data) => {
          if (data.ejectedPlayer) addChatMessage('SISTEMA', data.ejectedPlayer + ' foi ejetado! Raça: ' + data.ejectedFaction, 'alert');
          else addChatMessage('SISTEMA', 'Impasse. Ninguém ejetado.', 'system');
        });

        socket.on('gameOver', (data) => {
          alert('FIM DE JOGO! Vitória: ' + data.winner);
          location.reload();
        });

        function renderGameCards(players) {
          document.getElementById('gameCardsGrid').innerHTML = players.map(p => {
            const status = p.alive ? 'alive' : 'dead';
            let badge = '', display = p.avatar;
            if (!p.alive && p.faction) {
              display = p.faction === 'RIMK' ? { skin: '#88bb44', moustache: 'classic', glasses: 'none', hat: 'none' } : { skin: '#ffffff', moustache: 'none', glasses: 'none', hat: 'none' };
              badge = p.faction === 'RIMK' ? '<span class="badge badge-rimk">RIMK</span>' : '<span class="badge badge-zunk">ZUNK</span>';
            }
            return '<div class="player-card ' + status + '"><div class="avatar-box">' + generateAvatarSVG(display) + '</div><b>' + p.name + '</b><br>' + badge + '</div>';
          }).join('');
        }

        function renderNightActions(players) {
          const panel = document.getElementById('actionPanel');
          const aliveTargets = players.filter(p => p.id !== socket.id && p.alive);
          if (!players.find(p => p.id === socket.id && p.alive)) return panel.innerHTML = '<p>Você foi eliminado.</p>';
          
          panel.innerHTML = '<p>Selecione seu alvo:</p>';
          if (myPlayerData.faction === 'ZUNK') aliveTargets.forEach(t => panel.innerHTML += '<button onclick="sendNightAction(\'ZUNK_KILL\', \'' + t.id + '\')">Desintegrar ' + t.name + '</button> ');
          else if (myPlayerData.role === 'SHIELD_ENGINEER') players.forEach(t => { if(t.alive) panel.innerHTML += '<button onclick="sendNightAction(\'SHIELD_PROTECT\', \'' + t.id + '\')">Proteger ' + t.name + '</button> '});
          else if (myPlayerData.role === 'BIOLOGIST') aliveTargets.forEach(t => panel.innerHTML += '<button onclick="sendNightAction(\'BIOLOGIST_SCAN\', \'' + t.id + '\')">Escanear ' + t.name + '</button> ');
          else panel.innerHTML = '<p>Permaneça em silêncio no alojamento...</p>';
        }

        function renderDayActions(players) {
          const panel = document.getElementById('actionPanel');
          if (!players.find(p => p.id === socket.id && p.alive)) return panel.innerHTML = '<p>Você está fora da comunicação.</p>';
          
          panel.innerHTML = '';
          players.filter(p => p.alive).forEach(t => panel.innerHTML += '<button onclick="sendVote(\'' + t.id + '\')">Votar ' + t.name + '</button> ');
          panel.innerHTML += '<br><br><button onclick="sendVote(\'SKIP\')">Pular Voto</button>';
        }

        function sendNightAction(type, target) { socket.emit('submitNightAction', { roomCode: currentRoomCode, actionType: type, targetId: target }); document.getElementById('actionPanel').innerHTML = '<p>Ação enviada!</p>'; }
        function sendVote(target) { socket.emit('submitVote', { roomCode: currentRoomCode, targetId: target }); document.getElementById('actionPanel').innerHTML = '<p>Voto computado!</p>'; }
        
        function sendChat() {
          const txt = document.getElementById('chatInput').value.trim();
          if (txt && currentRoomCode) { socket.emit('sendChatMessage', { roomCode: currentRoomCode, text: txt }); document.getElementById('chatInput').value = ''; }
        }

        function addChatMessage(sender, text, type) {
          const box = document.getElementById('chatBox');
          box.innerHTML += '<div class="chat-msg ' + (type || 'normal') + '"><b>[' + sender + ']:</b> ' + text + '</div>';
          box.scrollTop = box.scrollHeight;
        }
      </script>
    </body>
    </html>
  `);
});

// --- LÓGICA DE SERVIDOR ---
io.on('connection', (socket) => {

  socket.on('createRoom', ({ name, avatar, maxPlayers, debateTime }) => {
    let roomCode = generateRoomCode();
    while (rooms[roomCode]) { roomCode = generateRoomCode(); }

    const limit = Math.min(Math.max(maxPlayers || 5, 5), 7);

    rooms[roomCode] = {
      code: roomCode, hostId: socket.id, maxPlayers: limit,
      debateTime: debateTime || 300, // NOVO PARÂMETRO
      state: 'LOBBY', players: {}, nightActions: {}, votes: {}, skipDebateVotes: new Set(),
      timer: null, timeLeft: 0, turn: 1
    };

    rooms[roomCode].players[socket.id] = { id: socket.id, name: name, avatar: avatar, isHost: true, alive: true };
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, isHost: true });
    io.to(roomCode).emit('updateQueue', { players: Object.values(rooms[roomCode].players), maxPlayers: limit });
  });

  socket.on('joinRoom', ({ name, avatar, roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('errorMsg', 'Sala não encontrada!');
    if (room.state !== 'LOBBY') return socket.emit('errorMsg', 'Partida em andamento.');
    if (Object.keys(room.players).length >= room.maxPlayers) return socket.emit('errorMsg', 'Sala cheia!');

    room.players[socket.id] = { id: socket.id, name: name, avatar: avatar, isHost: false, alive: true };
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, isHost: false });
    io.to(roomCode).emit('updateQueue', { players: Object.values(room.players), maxPlayers: room.maxPlayers });
  });

  socket.on('startGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== socket.id) return;

    assignRoles(room);
    room.state = 'NOITE';
    
    Object.keys(room.players).forEach(id => {
      io.to(id).emit('gameStarted', { role: room.players[id].role, faction: room.players[id].faction, playersList: Object.values(room.players) });
    });
    startNightPhase(roomCode);
  });

  function startNightPhase(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    room.state = 'NOITE';
    clearInterval(room.timer);
    io.to(roomCode).emit('startNight', { turn: room.turn, playersList: Object.values(room.players) });
  }

  function startDayPhase(roomCode, killedPlayer) {
    const room = rooms[roomCode];
    if (!room) return;
    room.state = 'DIA';
    room.votes = {}; room.skipDebateVotes.clear();
    room.timeLeft = room.debateTime; // USA O TEMPO CONFIGURADO PELO HOST

    io.to(roomCode).emit('startDay', { killedPlayer, playersList: Object.values(room.players) });
    io.to(roomCode).emit('updateSkipCount', 0);
    io.to(roomCode).emit('timerUpdate', room.timeLeft);

    clearInterval(room.timer);
    room.timer = setInterval(() => {
      room.timeLeft--;
      io.to(roomCode).emit('timerUpdate', room.timeLeft);
      if (room.timeLeft <= 0) { clearInterval(room.timer); resolveVotes(roomCode); }
    }, 1000);
  }

  socket.on('submitNightAction', ({ roomCode, actionType, targetId }) => {
    const room = rooms[roomCode], p = room?.players[socket.id];
    if (!p || !p.alive || room.state !== 'NOITE') return;

    if (actionType === 'ZUNK_KILL' && p.faction === 'ZUNK') room.nightActions.zunk = targetId;
    else if (actionType === 'SHIELD_PROTECT' && p.role === 'SHIELD_ENGINEER') room.nightActions.shield = targetId;
    else if (actionType === 'BIOLOGIST_SCAN' && p.role === 'BIOLOGIST') socket.emit('scanResult', { targetName: room.players[targetId]?.name, faction: room.players[targetId]?.faction });

    let kId = (room.nightActions.zunk && room.nightActions.zunk !== room.nightActions.shield) ? room.nightActions.zunk : null;
    if (kId && room.players[kId]) room.players[kId].alive = false;
    
    room.nightActions = {};
    if (checkVictory(roomCode)) return;
    startDayPhase(roomCode, kId ? room.players[kId].name : null);
  });

  socket.on('submitVote', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'DIA' || !room.players[socket.id]?.alive) return;
    room.votes[socket.id] = targetId;
    if (Object.keys(room.votes).length >= Object.values(room.players).filter(p => p.alive).length) { clearInterval(room.timer); resolveVotes(roomCode); }
  });

  socket.on('voteSkipDebate', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'DIA' || !room.players[socket.id]?.alive) return;
    room.skipDebateVotes.add(socket.id);
    io.to(roomCode).emit('updateSkipCount', room.skipDebateVotes.size);
    if (room.skipDebateVotes.size >= Math.ceil(Object.values(room.players).filter(p => p.alive).length / 2)) {
      clearInterval(room.timer); io.to(roomCode).emit('chatMessage', { sender: 'SISTEMA', text: 'Debate encerrado por maioria!', type: 'system' }); resolveVotes(roomCode);
    }
  });

  socket.on('sendChatMessage', ({ roomCode, text }) => { io.to(roomCode).emit('chatMessage', { sender: rooms[roomCode]?.players[socket.id]?.name, text }); });

  function resolveVotes(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    const counts = {};
    Object.values(room.votes).forEach(t => { if (t !== 'SKIP') counts[t] = (counts[t] || 0) + 1; });

    let max = 0, eId = null, tie = false;
    for (const [t, c] of Object.entries(counts)) { if (c > max) { max = c; eId = t; tie = false; } else if (c === max) tie = true; }

    if (!tie && eId && room.players[eId]) room.players[eId].alive = false;
    io.to(roomCode).emit('ejectionResult', { ejectedPlayer: (!tie && eId) ? room.players[eId].name : null, ejectedFaction: (!tie && eId) ? room.players[eId].faction : null });
    
    if (checkVictory(roomCode)) return;
    room.turn++; setTimeout(() => startNightPhase(roomCode), 4000);
  }

  function checkVictory(code) {
    const room = rooms[code];
    const alv = Object.values(room.players).filter(p => p.alive);
    const z = alv.filter(p => p.faction === 'ZUNK').length, r = alv.filter(p => p.faction === 'RIMK').length;
    if (z === 0) { io.to(code).emit('gameOver', { winner: 'RIMKS' }); return true; }
    if (z >= r) { io.to(code).emit('gameOver', { winner: 'ZUNKS' }); return true; }
    return false;
  }

  socket.on('disconnect', () => {
    for (const code in rooms) {
      if (rooms[code].players[socket.id]) {
        delete rooms[code].players[socket.id];
        if (Object.keys(rooms[code].players).length === 0) delete rooms[code];
        else io.to(code).emit('updateQueue', { players: Object.values(rooms[code].players), maxPlayers: rooms[code].maxPlayers });
        break;
      }
    }
  });
});

server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
