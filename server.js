const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Armazenamento em memória das salas
const rooms = {};

// Gera código aleatório de 4 letras
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('Novo jogador conectado:', socket.id);

  // 1. CRIAR SALA
  socket.on('createRoom', ({ name, avatar, maxPlayers, debateMinutes }) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      code: roomCode,
      hostId: socket.id,
      maxPlayers: parseInt(maxPlayers) || 5,
      debateMinutes: parseInt(debateMinutes) || 3,
      state: 'LOBBY', // LOBBY, NIGHT, DAY
      turn: 0,
      players: [],
      nightActions: {}, // Armazena ações de cada um na noite
      votes: {},        // Armazena votos de ejeção no dia
      timer: null
    };

    const player = {
      id: socket.id,
      name,
      avatar,
      isHost: true,
      alive: true,
      role: null,
      faction: null
    };

    rooms[roomCode].players.push(player);
    socket.join(roomCode);

    socket.emit('roomJoined', { roomCode, isHost: true });
    io.to(roomCode).emit('updateQueue', {
      players: rooms[roomCode].players,
      maxPlayers: rooms[roomCode].maxPlayers
    });
  });

  // 2. ENTRAR EM SALA
  socket.on('joinRoom', ({ name, avatar, roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('errorMsg', 'Sala não encontrada!');
    if (room.state !== 'LOBBY') return socket.emit('errorMsg', 'A partida já começou!');
    if (room.players.length >= room.maxPlayers) return socket.emit('errorMsg', 'Sala cheia!');

    const player = {
      id: socket.id,
      name,
      avatar,
      isHost: false,
      alive: true,
      role: null,
      faction: null
    };

    room.players.push(player);
    socket.join(roomCode);

    socket.emit('roomJoined', { roomCode, isHost: false });
    io.to(roomCode).emit('updateQueue', {
      players: room.players,
      maxPlayers: room.maxPlayers
    });
  });

  // 3. INICIAR PARTIDA E DISTRIBUIR PAPÉIS
  socket.on('startGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== socket.id) return;

    // Sorteio de Funções
    const rolesPool = ['ZUNK', 'BIOLOGIST', 'SHIELD_ENGINEER', 'RIMK', 'RIMK', 'RIMK', 'RIMK'];
    const shuffledRoles = rolesPool.sort(() => 0.5 - Math.random());

    room.players.forEach((p, idx) => {
      const assigned = shuffledRoles[idx] || 'RIMK';
      p.role = assigned;
      p.faction = (assigned === 'ZUNK') ? 'ZUNK' : 'RIMK';

      // Notifica individualmente cada jogador sobre sua função
      io.to(p.id).emit('gameStarted', {
        role: getRoleDisplayName(p.role),
        roleKey: p.role,
        faction: p.faction
      });
    });

    // Começa a primeira noite
    startNightPhase(roomCode);
  });

  // 4. REGISTRAR AÇÕES NOTURNAS
  socket.on('nightAction', ({ roomCode, action, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'NIGHT') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.alive) return;

    // Trata ação do Biólogo imediatamente em privado
    if (action === 'scan') {
      const target = room.players.find(p => p.id === targetId);
      if (target) {
        socket.emit('scanResult', {
          targetName: target.name,
          faction: target.faction
        });
      }
    } else {
      // Salva ações de Eliminar (Zunk) ou Proteger (Engenheiro)
      room.nightActions[action] = targetId;
    }
  });

  // 5. REGISTRAR VOTOS DO DIA (EJEÇÃO)
  socket.on('voteEject', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'DAY') return;

    room.votes[socket.id] = targetId;

    // Se todos os vivos votaram, encerra o dia imediatamente
    const alivePlayers = room.players.filter(p => p.alive);
    if (Object.keys(room.votes).length >= alivePlayers.length) {
      clearInterval(room.timer);
      resolveDayPhase(roomCode);
    }
  });

  // CHAT DE BORDO
  socket.on('sendChat', ({ roomCode, text }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    if (room.state === 'NIGHT') {
      return socket.emit('errorMsg', 'Comunicação bloqueada durante o Eclipse!');
    }

    if (!player.alive) {
      // Chat dos Mortos (Frequência Fantasma)
      const deadPlayers = room.players.filter(p => !p.alive);
      deadPlayers.forEach(dp => {
        io.to(dp.id).emit('chatMessage', { sender: player.name, text, channel: 'ghost' });
      });
    } else {
      // Chat dos Vivos
      io.to(roomCode).emit('chatMessage', { sender: player.name, text, channel: 'global' });
    }
  });

  socket.on('disconnect', () => {
    // Limpeza ao desconectar se necessário
  });
});

// --- FUNÇÕES DE TRANSIÇÃO DE FASE DA PARTIDA ---

function startNightPhase(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  room.state = 'NIGHT';
  room.turn += 1;
  room.nightActions = {};

  io.to(roomCode).emit('startNight', {
    turn: room.turn,
    playersList: getPublicPlayersList(room.players)
  });

  // Timer fixo de 30 segundos para a noite
  let nightSecondsLeft = 30;
  clearInterval(room.timer);

  room.timer = setInterval(() => {
    nightSecondsLeft--;
    io.to(roomCode).emit('timerUpdate', nightSecondsLeft);

    if (nightSecondsLeft <= 0) {
      clearInterval(room.timer);
      resolveNightPhase(roomCode);
    }
  }, 1000);
}

function resolveNightPhase(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const killedId = room.nightActions['kill'];
  const shieldedId = room.nightActions['shield'];
  let killedPlayerName = null;

  // Resolve o ataque do Zunk levando em conta o escudo do Engenheiro
  if (killedId && killedId !== shieldedId) {
    const victim = room.players.find(p => p.id === killedId);
    if (victim) {
      victim.alive = false;
      killedPlayerName = victim.name;
    }
  }

  // Verifica condição de vitória antes de abrir o dia
  if (checkGameOver(roomCode)) return;

  startDayPhase(roomCode, killedPlayerName);
}

function startDayPhase(roomCode, killedPlayerName) {
  const room = rooms[roomCode];
  if (!room) return;

  room.state = 'DAY';
  room.votes = {};

  io.to(roomCode).emit('startDay', {
    killedPlayer: killedPlayerName,
    playersList: getPublicPlayersList(room.players)
  });

  // Temporizador de discussão configurado pelo Host
  let daySecondsLeft = (room.debateMinutes || 3) * 60;
  clearInterval(room.timer);

  room.timer = setInterval(() => {
    daySecondsLeft--;
    io.to(roomCode).emit('timerUpdate', daySecondsLeft);

    if (daySecondsLeft <= 0) {
      clearInterval(room.timer);
      resolveDayPhase(roomCode);
    }
  }, 1000);
}

function resolveDayPhase(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  // Contagem de Votos
  const voteCounts = {};
  Object.values(room.votes).forEach(targetId => {
    if (targetId && targetId !== 'skip') {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    }
  });

  let mostVotedId = null;
  let maxVotes = 0;
  let tie = false;

  for (const [targetId, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) {
      maxVotes = count;
      mostVotedId = targetId;
      tie = false;
    } else if (count === maxVotes) {
      tie = true;
    }
  }

  let ejectedPlayerName = null;
  let ejectedFaction = null;

  if (mostVotedId && !tie) {
    const ejected = room.players.find(p => p.id === mostVotedId);
    if (ejected) {
      ejected.alive = false;
      ejectedPlayerName = ejected.name;
      ejectedFaction = ejected.faction;
    }
  }

  io.to(roomCode).emit('ejectionResult', {
    ejectedPlayer: ejectedPlayerName,
    ejectedFaction: ejectedFaction
  });

  // Se o jogo não acabou após a votação, volta para a Noite
  if (!checkGameOver(roomCode)) {
    setTimeout(() => {
      startNightPhase(roomCode);
    }, 5000);
  }
}

function checkGameOver(roomCode) {
  const room = rooms[roomCode];
  if (!room) return false;

  const aliveZunks = room.players.filter(p => p.alive && p.faction === 'ZUNK').length;
  const aliveRimks = room.players.filter(p => p.alive && p.faction === 'RIMK').length;

  if (aliveZunks === 0) {
    io.to(roomCode).emit('gameOver', { winner: '🟢 OS RIMKS VENCERAM! A estação está segura.' });
    clearInterval(room.timer);
    return true;
  }

  if (aliveZunks >= aliveRimks) {
    io.to(roomCode).emit('gameOver', { winner: '🔴 OS ZUNKS DOMINARAM A ESTAÇÃO!' });
    clearInterval(room.timer);
    return true;
  }

  return false;
}

function getPublicPlayersList(players) {
  return players.map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    alive: p.alive,
    faction: p.alive ? null : p.faction // Revela facção apenas se estiver morto
  }));
}

function getRoleDisplayName(role) {
  switch (role) {
    case 'ZUNK': return 'Infiltrado Zunk';
    case 'BIOLOGIST': return 'Biólogo';
    case 'SHIELD_ENGINEER': return 'Engenheiro de Escudo';
    default: return 'Tripulante Rimk';
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
