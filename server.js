const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const ROLE_MAP = {
  ZUNK: { name: 'Infiltrado Zunk', faction: 'ZUNK' },
  BIOLOGIST: { name: 'Biólogo', faction: 'RIMK' },
  SHIELD_ENGINEER: { name: 'Engenheiro de Escudo', faction: 'RIMK' },
  RIMK_CREW: { name: 'Tripulante Rimk', faction: 'RIMK' }
};

function assignRoles(room) {
  const playerIds = Object.keys(room.players);
  const count = playerIds.length;
  let rolesPool = ['ZUNK'];

  if (count >= 7) rolesPool.push('ZUNK');
  if (count >= 4) rolesPool.push('BIOLOGIST');
  if (count >= 5) rolesPool.push('SHIELD_ENGINEER');

  while (rolesPool.length < count) rolesPool.push('RIMK_CREW');

  for (let i = rolesPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rolesPool[i], rolesPool[j]] = [rolesPool[j], rolesPool[i]];
  }

  playerIds.forEach((id, index) => {
    const roleKey = rolesPool[index];
    const roleInfo = ROLE_MAP[roleKey];
    room.players[id].roleKey = roleKey;
    room.players[id].role = roleInfo.name;
    room.players[id].faction = roleInfo.faction;
    room.players[id].alive = true;
  });
}

function getPublicPlayersList(players) {
  return Object.values(players).map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    alive: p.alive,
    isHost: p.isHost,
    faction: p.alive ? null : p.faction
  }));
}

io.on('connection', (socket) => {

  socket.on('createRoom', ({ name, avatar, maxPlayers, debateMinutes }) => {
    let roomCode = generateRoomCode();
    while (rooms[roomCode]) { roomCode = generateRoomCode(); }

    const limit = Math.min(Math.max(parseInt(maxPlayers) || 5, 5), 7);
    const debateTimeInSeconds = (parseInt(debateMinutes) || 3) * 60;

    rooms[roomCode] = {
      code: roomCode,
      hostId: socket.id,
      maxPlayers: limit,
      debateTime: debateTimeInSeconds,
      state: 'LOBBY',
      players: {},
      nightActions: {},
      votes: {},
      skipDebateVotes: new Set(),
      timer: null,
      timeLeft: 0,
      turn: 1
    };

    rooms[roomCode].players[socket.id] = { id: socket.id, name, avatar, isHost: true, alive: true };
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, isHost: true });
    io.to(roomCode).emit('updateQueue', { players: Object.values(rooms[roomCode].players), maxPlayers: limit });
  });

  socket.on('joinRoom', ({ name, avatar, roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('errorMsg', 'Sala não encontrada!');
    if (room.state !== 'LOBBY') return socket.emit('errorMsg', 'Partida já iniciada nesta sala.');
    if (Object.keys(room.players).length >= room.maxPlayers) return socket.emit('errorMsg', 'A sala já está cheia!');

    room.players[socket.id] = { id: socket.id, name, avatar, isHost: false, alive: true };
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, isHost: false });
    io.to(roomCode).emit('updateQueue', { players: Object.values(room.players), maxPlayers: room.maxPlayers });
  });

  socket.on('sendLobbyChat', ({ roomCode, text }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'LOBBY') return;
    const p = room.players[socket.id];
    if (!p || !text || !text.trim()) return;

    io.to(roomCode).emit('lobbyChatMessage', { sender: p.name, text: text.trim() });
  });

  socket.on('startGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== socket.id) return;

    assignRoles(room);
    room.turn = 1;

    Object.keys(room.players).forEach(id => {
      io.to(id).emit('gameStarted', {
        roleKey: room.players[id].roleKey,
        role: room.players[id].role,
        faction: room.players[id].faction,
        playersList: getPublicPlayersList(room.players)
      });
    });

    startNightPhase(roomCode);
  });

  // 🔄 Reiniciar partida com os mesmos jogadores
  socket.on('playAgain', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.hostId !== socket.id) return socket.emit('errorMsg', 'Apenas o Host pode iniciar nova rodada.');

    clearInterval(room.timer);

    assignRoles(room);
    room.turn = 1;
    room.nightActions = {};
    room.votes = {};
    room.skipDebateVotes.clear();
    room.state = 'LOBBY';

    io.to(roomCode).emit('gameRestarted', { playersList: getPublicPlayersList(room.players) });

    // Envia os novos papéis individualmente após 2.5 segundos
    setTimeout(() => {
      Object.keys(room.players).forEach(id => {
        io.to(id).emit('gameStarted', {
          roleKey: room.players[id].roleKey,
          role: room.players[id].role,
          faction: room.players[id].faction,
          playersList: getPublicPlayersList(room.players)
        });
      });
      startNightPhase(roomCode);
    }, 2500);
  });

  const handleNightAction = ({ roomCode, action, actionType, targetId }) => {
    const room = rooms[roomCode];
    const p = room?.players[socket.id];
    if (!p || !p.alive || room.state !== 'NOITE') return;

    const act = action || actionType;

    if ((act === 'kill' || act === 'ZUNK_KILL') && p.faction === 'ZUNK') {
      room.nightActions.zunk = targetId;
    } else if ((act === 'shield' || act === 'SHIELD_PROTECT') && p.roleKey === 'SHIELD_ENGINEER') {
      room.nightActions.shield = targetId;
    } else if ((act === 'scan' || act === 'BIOLOGIST_SCAN') && p.roleKey === 'BIOLOGIST') {
      const target = room.players[targetId];
      const facName = target?.faction === 'ZUNK' ? 'INFILTRADO ZUNK' : 'RIMK';
      socket.emit('scanResult', { targetName: target?.name, faction: facName });
    }
  };

  socket.on('nightAction', handleNightAction);
  socket.on('submitNightAction', handleNightAction);

  const handleVote = ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'DIA' || !room.players[socket.id]?.alive) return;

    room.votes[socket.id] = targetId;

    const aliveCount = Object.values(room.players).filter(p => p.alive).length;
    if (Object.keys(room.votes).length >= aliveCount) {
      clearInterval(room.timer);
      resolveVotes(roomCode);
    }
  };

  socket.on('voteEject', handleVote);
  socket.on('submitVote', handleVote);

  socket.on('voteSkipDebate', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'DIA' || !room.players[socket.id]?.alive) return;

    room.skipDebateVotes.add(socket.id);
    io.to(roomCode).emit('updateSkipCount', room.skipDebateVotes.size);

    const aliveCount = Object.values(room.players).filter(p => p.alive).length;
    if (room.skipDebateVotes.size >= Math.ceil(aliveCount / 2)) {
      clearInterval(room.timer);
      io.to(roomCode).emit('chatMessage', { sender: 'SISTEMA', text: 'Discussão encerrada por maioria!', type: 'system', channel: 'alive' });
      resolveVotes(roomCode);
    }
  });

  const handleChat = ({ roomCode, text }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const p = room.players[socket.id];
    if (!p) return;

    if (!p.alive) {
      Object.values(room.players).forEach(player => {
        if (!player.alive) {
          io.to(player.id).emit('chatMessage', { sender: p.name, text, type: 'dead', channel: 'ghost' });
        }
      });
    } else {
      // Permite chat no DIA e também quando a partida terminou (state = END)
      if (room.state !== 'DIA' && room.state !== 'END') return;
      io.to(roomCode).emit('chatMessage', { sender: p.name, text, type: 'normal', channel: 'alive' });
    }
  };

  socket.on('sendChat', handleChat);
  socket.on('sendChatMessage', handleChat);

  socket.on('disconnect', () => {
    for (const code in rooms) {
      if (rooms[code].players[socket.id]) {
        delete rooms[code].players[socket.id];
        if (Object.keys(rooms[code].players).length === 0) {
          clearInterval(rooms[code].timer);
          delete rooms[code];
        } else {
          if (rooms[code].hostId === socket.id) {
            // Passa o host pra outro jogador
            const newHostId = Object.keys(rooms[code].players)[0];
            rooms[code].hostId = newHostId;
            rooms[code].players[newHostId].isHost = true;
            io.to(code).emit('chatMessage', {
              sender: 'SISTEMA',
              text: `${rooms[code].players[newHostId].name} agora é o novo Host.`,
              type: 'system'
            });
          }
          io.to(code).emit('updateQueue', { players: Object.values(rooms[code].players), maxPlayers: rooms[code].maxPlayers });
        }
        break;
      }
    }
  });
});

function startNightPhase(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  room.state = 'NOITE';
  room.nightActions = {};
  room.timeLeft = 45;

  io.to(roomCode).emit('startNight', { turn: room.turn, playersList: getPublicPlayersList(room.players) });
  io.to(roomCode).emit('timerUpdate', room.timeLeft);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(roomCode).emit('timerUpdate', room.timeLeft);

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      resolveNightPhase(roomCode);
    }
  }, 1000);
}

function resolveNightPhase(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  let killedId = null;
  const zunkTarget = room.nightActions.zunk;
  const shieldTarget = room.nightActions.shield;

  if (zunkTarget && zunkTarget !== shieldTarget) {
    killedId = zunkTarget;
    if (room.players[killedId]) {
      room.players[killedId].alive = false;
    }
  }

  const killedName = (killedId && room.players[killedId]) ? room.players[killedId].name : null;

  // Atualiza os cards imediatamente (com a revelação do Zunk se for o caso)
  io.to(roomCode).emit('playersUpdated', { playersList: getPublicPlayersList(room.players) });

  if (checkVictory(roomCode)) return;
  startDayPhase(roomCode, killedName);
}

function startDayPhase(roomCode, killedPlayer) {
  const room = rooms[roomCode];
  if (!room) return;

  room.state = 'DIA';
  room.votes = {};
  room.skipDebateVotes.clear();
  room.timeLeft = room.debateTime;

  io.to(roomCode).emit('startDay', { killedPlayer, playersList: getPublicPlayersList(room.players) });
  io.to(roomCode).emit('updateSkipCount', 0);
  io.to(roomCode).emit('timerUpdate', room.timeLeft);

  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(roomCode).emit('timerUpdate', room.timeLeft);

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      resolveVotes(roomCode);
    }
  }, 1000);
}

function resolveVotes(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const counts = {};
  Object.values(room.votes).forEach(t => {
    if (t && t !== 'SKIP' && t !== 'skip') {
      counts[t] = (counts[t] || 0) + 1;
    }
  });

  let max = 0, eId = null, tie = false;
  for (const [t, c] of Object.entries(counts)) {
    if (c > max) { max = c; eId = t; tie = false; }
    else if (c === max) tie = true;
  }

  if (!tie && eId && room.players[eId]) {
    room.players[eId].alive = false;
  }

  const ejectedPlayer = (!tie && eId) ? room.players[eId] : null;
  const ejectedFactionName = ejectedPlayer ? (ejectedPlayer.faction === 'ZUNK' ? 'INFILTRADO ZUNK' : 'RIMK') : null;

  io.to(roomCode).emit('ejectionResult', {
    ejectedPlayer: ejectedPlayer ? ejectedPlayer.name : null,
    ejectedFaction: ejectedFactionName,
    playersList: getPublicPlayersList(room.players)
  });

  if (checkVictory(roomCode)) return;

  room.turn++;
  setTimeout(() => startNightPhase(roomCode), 4000);
}

function checkVictory(code) {
  const room = rooms[code];
  if (!room) return false;

  const alv = Object.values(room.players).filter(p => p.alive);
  const z = alv.filter(p => p.faction === 'ZUNK').length;
  const r = alv.filter(p => p.faction === 'RIMK').length;

  if (z === 0) {
    clearInterval(room.timer);
    room.state = 'END';
    io.to(code).emit('gameOver', {
      winner: 'RIMK',
      winnerText: '🛸 OS RIMKS VENCERAM! Todos os Infiltrados Zunks foram ejetados.',
      allPlayers: getPublicPlayersList(room.players).map(p => ({
        ...p,
        faction: room.players[p.id].faction
      }))
    });
    return true;
  }
  if (z >= r) {
    clearInterval(room.timer);
    room.state = 'END';
    io.to(code).emit('gameOver', {
      winner: 'ZUNK',
      winnerText: '👽 OS ZUNKS VENCERAM! A estação Alpha caiu sob controle dos Zunks.',
      allPlayers: getPublicPlayersList(room.players).map(p => ({
        ...p,
        faction: room.players[p.id].faction
      }))
    });
    return true;
  }
  return false;
}

server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
