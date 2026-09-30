const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Porta dinâmica para servidores em nuvem (Render, Koyeb, etc.)
const PORT = process.env.PORT || 3000;

// --- ESTADO GLOBAL DO JOGO ---
const game = {
  state: 'LOBBY',
  players: {},
  actions: { zunkTarget: null, shieldTarget: null, biologistTarget: null },
  turn: 1
};

// --- BALANCEAMENTO AUTOMÁTICO (5 A 7 JOGADORES) ---
function assignRoles(playerIds) {
  const count = playerIds.length;
  let rolesPool = [];

  if (count === 5) {
    const specialRole = Math.random() < 0.5 ? 'BIOLOGIST' : 'SHIELD_ENGINEER';
    rolesPool = ['ZUNK', specialRole, 'RIMK_CREW', 'RIMK_CREW', 'RIMK_CREW'];
  } else if (count === 6) {
    rolesPool = ['ZUNK', 'BIOLOGIST', 'SHIELD_ENGINEER', 'RIMK_CREW', 'RIMK_CREW', 'RIMK_CREW'];
  } else if (count >= 7) {
    rolesPool = ['ZUNK', 'ZUNK', 'BIOLOGIST', 'SHIELD_ENGINEER', 'RIMK_CREW', 'RIMK_CREW', 'RIMK_CREW'];
  }

  for (let i = rolesPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rolesPool[i], rolesPool[j]] = [rolesPool[j], rolesPool[i]];
  }

  playerIds.forEach((id, index) => {
    const role = rolesPool[index];
    game.players[id].role = role;
    game.players[id].faction = role === 'ZUNK' ? 'ZUNK' : 'RIMK';
    game.players[id].alive = true;
  });
}

// --- ENTREGA DA INTERFACE FRONTEND (HTML + CSS + CLIENT JS) ---
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Rimks vs Zunks - Infiltração Espacial</title>
      <style>
        body { font-family: monospace; background: #0a0a1a; color: #00ffcc; padding: 20px; }
        .card { border: 1px solid #00ffcc; padding: 15px; margin-bottom: 10px; background: #111122; border-radius: 8px; }
        button { background: #00ffcc; color: #000; border: none; padding: 8px 12px; cursor: pointer; font-weight: bold; margin: 4px; border-radius: 4px; }
        button:disabled { background: #555; cursor: not-allowed; }
        input { padding: 8px; background: #1a1a2e; border: 1px solid #00ffcc; color: #fff; }
      </style>
    </head>
    <body>
      <h1>🚀 Rimks vs Zunks</h1>

      <div id="lobbyView" class="card">
        <h3>Entrar na Estação Espacial</h3>
        <input type="text" id="username" placeholder="Seu apelido">
        <button id="joinBtn">Conectar</button>
        <br><br>
        <h4>Jogadores na Sala:</h4>
        <ul id="playersList"></ul>
        <button id="startBtn">Iniciar Jogo (Host)</button>
      </div>

      <div id="gameView" class="card" style="display:none;">
        <h3>Status da Missão</h3>
        <p>Seu Papel: <b id="myRole">---</b> (<span id="myFaction">---</span>)</p>
        <p>Estado Atual: <b id="gameState">ECLIPSE (NOITE)</b></p>
        <div id="actionPanel"></div>
        <div id="logPanel"></div>
      </div>

      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        let myPlayerData = {};

        document.getElementById('joinBtn').onclick = () => {
          const name = document.getElementById('username').value;
          socket.emit('joinGame', name);
        };

        document.getElementById('startBtn').onclick = () => {
          socket.emit('startGame');
        };

        socket.on('updatePlayers', (players) => {
          document.getElementById('playersList').innerHTML = players.map(p => '<li>' + p.name + '</li>').join('');
        });

        socket.on('gameStarted', (data) => {
          document.getElementById('lobbyView').style.display = 'none';
          document.getElementById('gameView').style.display = 'block';

          myPlayerData = data;
          document.getElementById('myRole').innerText = data.role;
          document.getElementById('myFaction').innerText = data.faction;

          renderNightActions(data.playersList);
        });

        socket.on('scanResult', (result) => {
          alert('[ESCÂNER GENÉTICO]: O jogador ' + result.targetName + ' é da raça: ' + result.faction);
        });

        socket.on('nightResults', (data) => {
          document.getElementById('gameState').innerText = 'TRANSMISSÃO (DIA)';
          const log = document.getElementById('logPanel');
          if (data.killedPlayer) {
            log.innerHTML = '<p style="color:red">⚠️ O jogador ' + data.killedPlayer + ' foi desintegrado!</p>';
          } else {
            log.innerHTML = '<p style="color:green">🛡️ Ninguém foi eliminado durante a noite!</p>';
          }
        });

        socket.on('gameOver', (data) => {
          alert('FIM DE JOGO! A vitória é da raça: ' + data.winner);
          location.reload();
        });

        function renderNightActions(players) {
          const panel = document.getElementById('actionPanel');
          panel.innerHTML = '<h4>Sua Ação Noturna:</h4>';

          const targets = players.filter(p => p.id !== socket.id && p.alive);

          if (myPlayerData.faction === 'ZUNK') {
            panel.innerHTML += '<p>Escolha um Rimk para desintegrar:</p>';
            targets.forEach(t => {
              panel.innerHTML += '<button onclick="sendAction(\\'ZUNK_KILL\\', \\'' + t.id + '\\')">' + t.name + '</button> ';
            });
          } else if (myPlayerData.role === 'SHIELD_ENGINEER') {
            panel.innerHTML += '<p>Escolha um jogador para proteger:</p>';
            players.forEach(t => {
              if(t.alive) panel.innerHTML += '<button onclick="sendAction(\\'SHIELD_PROTECT\\', \\'' + t.id + '\\')">' + t.name + '</button> ';
            });
          } else if (myPlayerData.role === 'BIOLOGIST') {
            panel.innerHTML += '<p>Escolha um jogador para escanear:</p>';
            targets.forEach(t => {
              panel.innerHTML += '<button onclick="sendAction(\\'BIOLOGIST_SCAN\\', \\'' + t.id + '\\')">' + t.name + '</button> ';
            });
          } else {
            panel.innerHTML += '<p>Aguarde em silêncio... Outros papéis estão agindo.</p>';
          }
        }

        function sendAction(actionType, targetId) {
          socket.emit('submitNightAction', { actionType, targetId });
          document.getElementById('actionPanel').innerHTML = '<p>Ação enviada! Aguardando os demais...</p>';
        }
      </script>
    </body>
    </html>
  `);
});

// --- LÓGICA DE WEBSOCKETS ---
io.on('connection', (socket) => {
  socket.on('joinGame', (playerName) => {
    if (game.state !== 'LOBBY') return;
    game.players[socket.id] = {
      id: socket.id,
      name: playerName || `Viajante ${socket.id.substring(0, 4)}`,
      role: null,
      faction: null,
      alive: true
    };
    io.emit('updatePlayers', Object.values(game.players));
  });

  socket.on('startGame', () => {
    const ids = Object.keys(game.players);
    if (ids.length < 5 || ids.length > 7) return;

    assignRoles(ids);
    game.state = 'NOITE';

    ids.forEach((id) => {
      const p = game.players[id];
      io.to(id).emit('gameStarted', {
        role: p.role,
        faction: p.faction,
        playersList: Object.values(game.players).map(u => ({ id: u.id, name: u.name, alive: u.alive }))
      });
    });
  });

  socket.on('submitNightAction', ({ actionType, targetId }) => {
    const player = game.players[socket.id];
    if (!player || !player.alive || game.state !== 'NOITE') return;

    if (actionType === 'ZUNK_KILL' && player.faction === 'ZUNK') {
      game.actions.zunkTarget = targetId;
    } else if (actionType === 'SHIELD_PROTECT' && player.role === 'SHIELD_ENGINEER') {
      game.actions.shieldTarget = targetId;
    } else if (actionType === 'BIOLOGIST_SCAN' && player.role === 'BIOLOGIST') {
      const target = game.players[targetId];
      socket.emit('scanResult', { targetName: target.name, faction: target.faction });
    }

    const aliveZunks = Object.values(game.players).filter(p => p.alive && p.faction === 'ZUNK').length;
    const aliveEngineers = Object.values(game.players).filter(p => p.alive && p.role === 'SHIELD_ENGINEER').length;

    if ((game.actions.zunkTarget || aliveZunks === 0) && (game.actions.shieldTarget || aliveEngineers === 0)) {
      let killedId = null;
      if (game.actions.zunkTarget && game.actions.zunkTarget !== game.actions.shieldTarget) {
        killedId = game.actions.zunkTarget;
        game.players[killedId].alive = false;
      }

      game.actions = { zunkTarget: null, shieldTarget: null, biologistTarget: null };
      game.state = 'DIA';

      io.emit('nightResults', {
        killedPlayer: killedId ? game.players[killedId].name : null,
        playersList: Object.values(game.players).map(u => ({ id: u.id, name: u.name, alive: u.alive }))
      });

      const alive = Object.values(game.players).filter(p => p.alive);
      const zunks = alive.filter(p => p.faction === 'ZUNK').length;
      const rimks = alive.filter(p => p.faction === 'RIMK').length;

      if (zunks === 0) io.emit('gameOver', { winner: 'RIMKS' });
      else if (zunks >= rimks) io.emit('gameOver', { winner: 'ZUNKS' });
    }
  });

  socket.on('disconnect', () => {
    delete game.players[socket.id];
    io.emit('updatePlayers', Object.values(game.players));
  });
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
