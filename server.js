const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- ESTADO GLOBAL DO JOGO ---
const game = {
  state: 'LOBBY',
  players: {},
  nightActions: { zunkTarget: null, shieldTarget: null, biologistTarget: null },
  votes: {},
  skipDebateVotes: new Set(),
  timer: null,
  timeLeft: 300,
  turn: 1
};

// --- BALANCEAMENTO AUTOMÁTICO ---
function assignRoles(playerIds) {
  const count = playerIds.length;
  let rolesPool = [];

  if (count < 5) {
    rolesPool = ['ZUNK', 'BIOLOGIST', 'SHIELD_ENGINEER', 'RIMK_CREW', 'RIMK_CREW'];
  } else if (count === 5) {
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
    game.players[id].role = role;
    game.players[id].faction = role === 'ZUNK' ? 'ZUNK' : 'RIMK';
    game.players[id].alive = true;
  });
}

// --- FRONTEND EMBUTIDO ---
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
        
        /* Grid de Cards */
        .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 15px; margin-top: 15px; }
        .player-card { background: #050d0f; border: 1px solid #005522; border-radius: 8px; padding: 10px; text-align: center; position: relative; }
        .player-card.alive { border-color: var(--matrix-green); box-shadow: 0 0 8px rgba(0, 255, 102, 0.2); }
        .player-card.dead { border-color: var(--alert-red); opacity: 0.6; filter: grayscale(80%); }
        
        .avatar-box { width: 100px; height: 100px; margin: 0 auto 8px auto; background: #020506; border-radius: 50%; border: 1px solid var(--matrix-green); display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .avatar-box svg { width: 90px; height: 90px; }

        .customizer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 10px 0; }
        select, input[type="text"] { background: #001100; border: 1px solid var(--matrix-green); color: var(--matrix-green); padding: 8px; width: 100%; border-radius: 4px; }
        
        button { background: var(--matrix-dark-green); color: var(--matrix-green); border: 1px solid var(--matrix-green); padding: 10px 15px; font-weight: bold; cursor: pointer; text-transform: uppercase; border-radius: 4px; transition: 0.2s; }
        button:hover { background: var(--matrix-green); color: #000; box-shadow: 0 0 12px var(--matrix-green); }

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
      </style>
    </head>
    <body>
      <div class="container">
        <div style="text-align: center;">
          <h1>🛸 ESTAÇÃO ALPHA: RIMKS VS ZUNKS 🛸</h1>
          <p style="color: #00aa44; margin: 0;">SISTEMA DE SEGURANÇA E DEDUÇÃO EMBARCADO</p>
        </div>

        <!-- TELA 1: LOBBY -->
        <div id="lobbyView" class="panel">
          <h3>[ REGISTRO DE TRIPULANTE & CUSTOMIZAÇÃO DE AVATAR ]</h3>
          <div style="display: grid; grid-template-columns: 150px 1fr; gap: 20px; align-items: center;">
            <div style="text-align: center;">
              <div class="avatar-box" id="avatarPreview"></div>
              <small>Prévia do Avatar</small>
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
                    <option value="classic">Moustache Clássico</option>
                    <option value="handlebar">Imperial Galáctico</option>
                  </select>
                </div>
                <div>
                  <label>Acessório:</label>
                  <select id="optGlasses" onchange="updatePreview()">
                    <option value="none">Nenhum</option>
                    <option value="visor">Visor Cyberpunk</option>
                    <option value="monocle">Monóculo Bio</option>
                  </select>
                </div>
                <div>
                  <label>Chapéu:</label>
                  <select id="optHat" onchange="updatePreview()">
                    <option value="none">Nenhum</option>
                    <option value="cap">Quepe de Oficial</option>
                    <option value="antenna">Antena Espacial</option>
                  </select>
                </div>
              </div>
              <button id="joinBtn" style="width: 100%; margin-top: 10px;">ENTRAR NA ESTAÇÃO</button>
            </div>
          </div>

          <hr style="border-color: #003311; margin: 20px 0;">

          <h4>TRIPULANTES CONECTADOS (<span id="playerCount">0</span>):</h4>
          <div id="lobbyCardsGrid" class="cards-grid"></div>
          
          <br>
          <button id="startBtn" style="width: 100%; background: #006622;">INICIAR SEQUÊNCIA DE MISSÃO (HOST)</button>
        </div>

        <!-- TELA 2: TELA DE JOGO -->
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
                <h3>PAINEL DE COMANDO & AÇÕES</h3>
                <div id="actionPanel"><p>Aguardando início do ciclo...</p></div>
                <div id="skipDebateBox" style="margin-top: 10px; display: none;">
                  <button id="skipDebateBtn" style="background: #aa6600; width: 100%;">
                    ⚡ VOTAR PARA AVANÇAR DEBATE (<span id="skipCount">0</span> Votos)
                  </button>
                </div>
              </div>
            </div>

            <div class="panel" style="display: flex; flex-direction: column; justify-content: space-between;">
              <h3>COMUNICAÇÃO DE BORDO</h3>
              <div id="chatBox" class="chat-box"></div>
              <div style="display: flex; gap: 5px; margin-top: 10px;">
                <input type="text" id="chatInput" placeholder="Mensagem de rádio..." onkeypress="if(event.key==='Enter') sendChat()">
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

        // GERADOR SVG CORRIGIDO
        function generateAvatarSVG(c) {
          if (!c) c = {};
          const skin = c.skin || '#55aa66';
          
          let m = '';
          if (c.moustache === 'classic') {
            m = '<path d="M 35 62 Q 50 55 65 62 Q 75 70 80 62 Q 65 68 50 66 Q 35 68 20 62 Q 25 70 35 62 Z" fill="#111" />';
          } else if (c.moustache === 'handlebar') {
            m = '<path d="M 30 60 Q 50 50 70 60 Q 85 50 80 65 Q 65 60 50 64 Q 35 60 20 65 Q 15 50 30 60 Z" fill="#221100" />';
          }

          let g = '';
          if (c.glasses === 'visor') {
            g = '<rect x="20" y="38" width="60" height="14" rx="4" fill="#00ffff" opacity="0.8"/>';
          } else if (c.glasses === 'monocle') {
            g = '<circle cx="35" cy="45" r="10" fill="none" stroke="#ffaa00" stroke-width="2"/><line x1="35" y1="55" x2="40" y2="70" stroke="#ffaa00" stroke-width="2"/>';
          }

          let h = '';
          if (c.hat === 'cap') {
            h = '<path d="M 15 28 Q 50 10 85 28 L 90 32 L 10 32 Z" fill="#003366"/><rect x="10" y="30" width="80" height="4" fill="#ffcc00"/>';
          } else if (c.hat === 'antenna') {
            h = '<line x1="50" y1="20" x2="50" y2="2" stroke="#00ff66" stroke-width="3"/><circle cx="50" cy="2" r="5" fill="#00ff66"/>';
          }

          return '<svg viewBox="0 0 100 100">' +
            '<path d="M 50 15 C 20 15 15 40 25 65 C 32 82 45 92 50 92 C 55 92 68 82 75 65 C 85 40 80 15 50 15 Z" fill="' + skin + '" />' +
            '<ellipse cx="35" cy="45" rx="10" ry="14" fill="#050505" transform="rotate(-12 35 45)"/>' +
            '<ellipse cx="65" cy="45" rx="10" ry="14" fill="#050505" transform="rotate(12 65 45)"/>' +
            '<ellipse cx="33" cy="42" rx="3" ry="5" fill="#ffffff" opacity="0.7"/>' +
            '<ellipse cx="63" cy="42" rx="3" ry="5" fill="#ffffff" opacity="0.7"/>' +
            '<circle cx="48" cy="56" r="1" fill="#222"/><circle cx="52" cy="56" r="1" fill="#222"/>' +
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

        function updatePreview() {
          const custom = getCustomizationFromUI();
          document.getElementById('avatarPreview').innerHTML = generateAvatarSVG(custom);
        }
        
        window.onload = () => { updatePreview(); };

        document.getElementById('joinBtn').onclick = () => {
          const name = document.getElementById('username').value.trim();
          if (!name) return alert('Por favor, digite um apelido!');
          const custom = getCustomizationFromUI();
          socket.emit('joinGame', { name: name, avatar: custom });
        };

        document.getElementById('startBtn').onclick = () => { socket.emit('startGame'); };
        document.getElementById('skipDebateBtn').onclick = () => { socket.emit('voteSkipDebate'); };

        socket.on('errorMsg', (msg) => { alert('⚠️ ' + msg); });

        socket.on('updatePlayers', (players) => {
          document.getElementById('playerCount').innerText = players.length;
          const lobbyGrid = document.getElementById('lobbyCardsGrid');
          lobbyGrid.innerHTML = players.map(p => 
            '<div class="player-card alive">' +
              '<div class="avatar-box">' + generateAvatarSVG(p.avatar) + '</div>' +
              '<b>' + p.name + '</b>' +
            '</div>'
          ).join('');
        });

        socket.on('gameStarted', (data) => {
          document.getElementById('lobbyView').style.display = 'none';
          document.getElementById('gameView').style.display = 'flex';

          myPlayerData = data;
          document.getElementById('myRole').innerText = data.role;
          document.getElementById('myFaction').innerText = data.faction;
          addChatMessage('SISTEMA', 'Missão iniciada na Estação Alpha. Identidades atribuídas!', 'system');
        });

        socket.on('startNight', (data) => {
          document.getElementById('gameState').innerText = 'ECLIPSE (NOITE ' + data.turn + ')';
          document.getElementById('skipDebateBox').style.display = 'none';
          renderGameCards(data.playersList);
          renderNightActions(data.playersList);
          addChatMessage('SISTEMA', 'A Estação entrou em Eclipse Orbital. Cuidado...', 'system');
        });

        socket.on('startDay', (data) => {
          document.getElementById('gameState').innerText = 'TRANSMISSÃO (DIA)';
          document.getElementById('skipDebateBox').style.display = 'block';
          renderGameCards(data.playersList);
          
          if (data.killedPlayer) {
            addChatMessage('SISTEMA', 'ALERTA DE SEGURANÇA: O tripulante ' + data.killedPlayer + ' foi desintegrado nesta noite!', 'alert');
          } else {
            addChatMessage('SISTEMA', 'RELATÓRIO: Nenhuma baixa registrada nesta noite. Os escudos contiveram os ataques.', 'system');
          }
          
          renderDayActions(data.playersList);
        });

        socket.on('timerUpdate', (seconds) => {
          const m = Math.floor(seconds / 60).toString().padStart(2, '0');
          const s = (seconds % 60).toString().padStart(2, '0');
          document.getElementById('timerDisplay').innerText = m + ':' + s;
        });

        socket.on('updateSkipCount', (count) => {
          document.getElementById('skipCount').innerText = count;
        });

        socket.on('scanResult', (result) => {
          alert('[ESCÂNER GENÉTICO]: O escâner revelou que ' + result.targetName + ' pertence à raça: ' + result.faction);
        });

        socket.on('chatMessage', (data) => {
          addChatMessage(data.sender, data.text, data.type);
        });

        socket.on('ejectionResult', (data) => {
          if (data.ejectedPlayer) {
            addChatMessage('SISTEMA', 'VOTAÇÃO ENCERRADA: ' + data.ejectedPlayer + ' foi ejetado no vácuo! Raça revelada: ' + data.ejectedFaction, 'alert');
          } else {
            addChatMessage('SISTEMA', 'VOTAÇÃO ENCERRADA: Impasse na votação. Ninguém foi ejetado.', 'system');
          }
        });

        socket.on('gameOver', (data) => {
          alert('FIM DE JOGO! A vitória é da raça: ' + data.winner);
          location.reload();
        });

        function renderGameCards(players) {
          const grid = document.getElementById('gameCardsGrid');
          grid.innerHTML = players.map(p => {
            const statusClass = p.alive ? 'alive' : 'dead';
            let factionBadge = '';
            let displayAvatar = p.avatar;

            if (!p.alive && p.faction) {
              if (p.faction === 'RIMK') {
                displayAvatar = { skin: '#88bb44', moustache: 'classic', glasses: 'none', hat: 'none' };
                factionBadge = '<span class="badge badge-rimk">RAÇA: RIMK</span>';
              } else {
                displayAvatar = { skin: '#ffffff', moustache: 'none', glasses: 'none', hat: 'none' };
                factionBadge = '<span class="badge badge-zunk">INFILTRADO: ZUNK</span>';
              }
            }

            return '<div class="player-card ' + statusClass + '">' +
              '<div class="avatar-box">' + generateAvatarSVG(displayAvatar) + '</div>' +
              '<b>' + p.name + '</b><br>' +
              '<small>' + (p.alive ? '🟢 Operacional' : '🔴 Ejetado/Eliminado') + '</small><br>' +
              factionBadge +
            '</div>';
          }).join('');
        }

        function renderNightActions(players) {
          const panel = document.getElementById('actionPanel');
          panel.innerHTML = '<p><b>Fase Noturna Ativa:</b> Realize sua ação secreta de bordo.</p>';

          const aliveTargets = players.filter(p => p.id !== socket.id && p.alive);
          const amIAlive = players.find(p => p.id === socket.id && p.alive);

          if (!amIAlive) {
            panel.innerHTML = '<p style="color:var(--alert-red)">Você foi eliminado. Acompanhe a transmissão em modo espectador.</p>';
            return;
          }

          if (myPlayerData.faction === 'ZUNK') {
            panel.innerHTML += '<p>Selecione o Rimk a ser desintegrado:</p>';
            aliveTargets.forEach(t => {
              panel.innerHTML += '<button onclick="sendNightAction(\'ZUNK_KILL\', \'' + t.id + '\')">' + t.name + '</button> ';
            });
          } else if (myPlayerData.role === 'SHIELD_ENGINEER') {
            panel.innerHTML += '<p>Selecione um tripulante para proteger com o Escudo:</p>';
            players.forEach(t => {
              if(t.alive) panel.innerHTML += '<button onclick="sendNightAction(\'SHIELD_PROTECT\', \'' + t.id + '\')">' + t.name + '</button> ';
            });
          } else if (myPlayerData.role === 'BIOLOGIST') {
            panel.innerHTML += '<p>Selecione um tripulante para escanear o DNA:</p>';
            aliveTargets.forEach(t => {
              panel.innerHTML += '<button onclick="sendNightAction(\'BIOLOGIST_SCAN\', \'' + t.id + '\')">' + t.name + '</button> ';
            });
          } else {
            panel.innerHTML += '<p>Tripulante comum: Permaneça em silêncio aguardando o fim do Eclipse...</p>';
          }
        }

        function renderDayActions(players) {
          const panel = document.getElementById('actionPanel');
          panel.innerHTML = '<p><b>Fase de Transmissão & Votação:</b> Debatam no chat e escolham quem ejetar.</p>';

          const amIAlive = players.find(p => p.id === socket.id && p.alive);
          if (!amIAlive) {
            panel.innerHTML = '<p style="color:var(--alert-red)">Sua transmissão foi cortada. Apenas acompanhe o debate.</p>';
            return;
          }

          const aliveTargets = players.filter(p => p.alive);
          aliveTargets.forEach(t => {
            panel.innerHTML += '<button onclick="sendVote(\'' + t.id + '\')">Ejetar ' + t.name + '</button> ';
          });
          panel.innerHTML += '<br><br><button style="background:#665500" onclick="sendVote(\'SKIP\')">Abster / Pular Voto</button>';
        }

        function sendNightAction(actionType, targetId) {
          socket.emit('submitNightAction', { actionType: actionType, targetId: targetId });
          document.getElementById('actionPanel').innerHTML = '<p style="color:var(--matrix-green)">Ação enviada com sucesso ao servidor central!</p>';
        }

        function sendVote(targetId) {
          socket.emit('submitVote', { targetId: targetId });
          document.getElementById('actionPanel').innerHTML = '<p style="color:var(--matrix-green)">Seu voto de ejeção foi computado!</p>';
        }

        function sendChat() {
          const input = document.getElementById('chatInput');
          const text = input.value.trim();
          if (text) {
            socket.emit('sendChatMessage', text);
            input.value = '';
          }
        }

        function addChatMessage(sender, text, type) {
          const box = document.getElementById('chatBox');
          const msgDiv = document.createElement('div');
          msgDiv.className = 'chat-msg ' + (type || 'normal');
          msgDiv.innerHTML = '<b>[' + sender + ']:</b> ' + text;
          box.appendChild(msgDiv);
          box.scrollTop = box.scrollHeight;
        }
      </script>
    </body>
    </html>
  `);
});

// --- LÓGICA DE WEBSOCKETS ---
io.on('connection', (socket) => {

  socket.on('joinGame', ({ name, avatar }) => {
    if (game.state !== 'LOBBY') {
      socket.emit('errorMsg', 'Partida já em andamento.');
      return;
    }
    game.players[socket.id] = {
      id: socket.id,
      name: name || `Viajante ${socket.id.substring(0, 4)}`,
      avatar: avatar || {},
      role: null,
      faction: null,
      alive: true
    };
    io.emit('updatePlayers', Object.values(game.players));
  });

  socket.on('startGame', () => {
    const ids = Object.keys(game.players);
    if (ids.length < 1) {
      socket.emit('errorMsg', 'Pelo menos 1 jogador necessário.');
      return;
    }

    assignRoles(ids);
    game.state = 'NOITE';
    game.turn = 1;

    ids.forEach((id) => {
      const p = game.players[id];
      io.to(id).emit('gameStarted', {
        role: p.role,
        faction: p.faction,
        playersList: Object.values(game.players).map(u => ({ id: u.id, name: u.name, avatar: u.avatar, alive: u.alive }))
      });
    });

    startNightPhase();
  });

  function startNightPhase() {
    game.state = 'NOITE';
    clearInterval(game.timer);

    io.emit('startNight', {
      turn: game.turn,
      playersList: Object.values(game.players).map(u => ({ id: u.id, name: u.name, avatar: u.avatar, alive: u.alive }))
    });
  }

  function startDayPhase(killedPlayerName) {
    game.state = 'DIA';
    game.votes = {};
    game.skipDebateVotes.clear();
    game.timeLeft = 300;

    io.emit('startDay', {
      killedPlayer: killedPlayerName,
      playersList: Object.values(game.players).map(u => ({ id: u.id, name: u.name, avatar: u.avatar, alive: u.alive, faction: u.alive ? null : u.faction }))
    });

    io.emit('updateSkipCount', 0);
    io.emit('timerUpdate', game.timeLeft);

    clearInterval(game.timer);
    game.timer = setInterval(() => {
      game.timeLeft -= 1;
      io.emit('timerUpdate', game.timeLeft);

      if (game.timeLeft <= 0) {
        clearInterval(game.timer);
        resolveVotes();
      }
    }, 1000);
  }

  socket.on('submitNightAction', ({ actionType, targetId }) => {
    const player = game.players[socket.id];
    if (!player || !player.alive || game.state !== 'NOITE') return;

    if (actionType === 'ZUNK_KILL' && player.faction === 'ZUNK') {
      game.nightActions.zunkTarget = targetId;
    } else if (actionType === 'SHIELD_PROTECT' && player.role === 'SHIELD_ENGINEER') {
      game.nightActions.shieldTarget = targetId;
    } else if (actionType === 'BIOLOGIST_SCAN' && player.role === 'BIOLOGIST') {
      const target = game.players[targetId];
      socket.emit('scanResult', { targetName: target ? target.name : 'Desconhecido', faction: target ? target.faction : 'N/A' });
    }

    let killedId = null;
    if (game.nightActions.zunkTarget && game.nightActions.zunkTarget !== game.nightActions.shieldTarget) {
      killedId = game.nightActions.zunkTarget;
      if (game.players[killedId]) game.players[killedId].alive = false;
    }

    const killedName = killedId && game.players[killedId] ? game.players[killedId].name : null;
    game.nightActions = { zunkTarget: null, shieldTarget: null, biologistTarget: null };

    if (checkVictory()) return;

    startDayPhase(killedName);
  });

  socket.on('submitVote', ({ targetId }) => {
    const player = game.players[socket.id];
    if (!player || !player.alive || game.state !== 'DIA') return;

    game.votes[socket.id] = targetId;
    const alivePlayers = Object.values(game.players).filter(p => p.alive);

    if (Object.keys(game.votes).length >= alivePlayers.length) {
      clearInterval(game.timer);
      resolveVotes();
    }
  });

  socket.on('voteSkipDebate', () => {
    const player = game.players[socket.id];
    if (!player || !player.alive || game.state !== 'DIA') return;

    game.skipDebateVotes.add(socket.id);
    const alivePlayers = Object.values(game.players).filter(p => p.alive);

    io.emit('updateSkipCount', game.skipDebateVotes.size);

    if (game.skipDebateVotes.size >= Math.ceil(alivePlayers.length / 2)) {
      clearInterval(game.timer);
      io.emit('chatMessage', { sender: 'SISTEMA', text: 'A maioria dos tripulantes votou para encerrar o debate antecipadamente!', type: 'system' });
      resolveVotes();
    }
  });

  socket.on('sendChatMessage', (text) => {
    const player = game.players[socket.id];
    if (!player) return;
    io.emit('chatMessage', { sender: player.name, text: text, type: 'normal' });
  });

  function resolveVotes() {
    const voteCounts = {};
    Object.values(game.votes).forEach(target => {
      if (target !== 'SKIP') voteCounts[target] = (voteCounts[target] || 0) + 1;
    });

    let maxVotes = 0;
    let ejectedId = null;
    let isTie = false;

    for (const [targetId, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        ejectedId = targetId;
        isTie = false;
      } else if (count === maxVotes) {
        isTie = true;
      }
    }

    let ejectedName = null;
    let ejectedFaction = null;

    if (!isTie && ejectedId && game.players[ejectedId]) {
      game.players[ejectedId].alive = false;
      ejectedName = game.players[ejectedId].name;
      ejectedFaction = game.players[ejectedId].faction;
    }

    io.emit('ejectionResult', { ejectedPlayer: ejectedName, ejectedFaction: ejectedFaction });

    if (checkVictory()) return;

    game.turn += 1;
    setTimeout(() => { startNightPhase(); }, 4000);
  }

  function checkVictory() {
    const alive = Object.values(game.players).filter(p => p.alive);
    const zunks = alive.filter(p => p.faction === 'ZUNK').length;
    const rimks = alive.filter(p => p.faction === 'RIMK').length;

    if (zunks === 0) {
      game.state = 'FINISHED';
      io.emit('gameOver', { winner: 'RIMKS (Tripulação Limpa)' });
      return true;
    } else if (zunks >= rimks) {
      game.state = 'FINISHED';
      io.emit('gameOver', { winner: 'ZUNKS (Infiltração Bem-Sucedida)' });
      return true;
    }
    return false;
  }

  socket.on('disconnect', () => {
    delete game.players[socket.id];
    io.emit('updatePlayers', Object.values(game.players));
  });
});

server.listen(PORT, () => {
  console.log(`Estação Alpha online na porta ${PORT}`);
});
