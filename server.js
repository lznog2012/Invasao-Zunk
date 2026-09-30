const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Servir arquivos da pasta 'public'
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
    const roleKey = rolesPool[index] || 'RIMK_CREW';
    const roleInfo = ROLE_MAP[roleKey];
    room.players[id].roleKey = roleKey;
    room.players[id].role = roleInfo.name;
    room.players[id].faction = roleInfo.faction;
    room.players[id].alive = true;
  });
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

  socket.on('startGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== socket.id) return;

    assignRoles(room);
    room.state = 'NOITE';

    Object.keys(room.players).forEach(id => {
      io.to(id).emit('gameStarted', {
        roleKey: room.players[id].roleKey,
        role: room.players[id].role,
        faction: room.players[id].faction,
        playersList: Object.values(room.players)
      });
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
    room.votes = {};
    room.skipDebateVotes.clear();
    room.timeLeft = room.debateTime;

    io.to(roomCode).emit('startDay', { killedPlayer, playersList: Object.values(room.players) });
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

  socket.on('submitNightAction', ({ roomCode, actionType, targetId }) => {
    const room = rooms[roomCode];
    const p = room?.players[socket.id];
    if (!p || !p.alive || room.state !== 'NOITE') return;

    if (actionType === 'ZUNK_KILL' && p.faction === 'ZUNK') room.nightActions.zunk = targetId;
    else if (actionType === 'SHIELD_PROTECT' && p.roleKey === 'SHIELD_ENGINEER') room.nightActions.shield = targetId;
    else if (actionType === 'BIOLOGIST_SCAN' && p.roleKey === 'BIOLOGIST') {
      const target = room.players[targetId];
      const facName = target?.faction === 'ZUNK' ? 'INFILTRADO ZUNK' : 'RIMK';
      socket.emit('scanResult', { targetName: target?.name, faction: facName });
    }

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
    if (Object.keys(room.votes).length >= Object.values(room.players).filter(p => p.alive).length) {
      clearInterval(room.timer);
      resolveVotes(roomCode);
    }
  });

  socket.on('voteSkipDebate', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'DIA' || !room.players[socket.id]?.alive) return;
    room.skipDebateVotes.add(socket.id);
    io.to(roomCode).emit('updateSkipCount', room.skipDebateVotes.size);
    if (room.skipDebateVotes.size >= Math.ceil(Object.values(room.players).filter(p => p.alive).length / 2)) {
      clearInterval(room.timer);
      io.to(roomCode).emit('chatMessage', { sender: 'SISTEMA', text: 'Discussão encerrada por maioria!', type: 'system', channel: 'alive' });
      resolveVotes(roomCode);
    }
  });

  socket.on('sendChatMessage', ({ roomCode, text }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const p = room.players[socket.id];
    if (!p) return;

    if (!p.alive) {
      Object.values(room.players).forEach(player => {
        if (!player.alive) {
          io.to(player.id).emit('chatMessage', { sender: p.name, text, type: 'dead', channel: 'dead' });
        }
      });
    } else {
      if (room.state !== 'DIA') return;
      io.to(roomCode).emit('chatMessage', { sender: p.name, text, type: 'normal', channel: 'alive' });
    }
  });

  function resolveVotes(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    const counts = {};
    Object.values(room.votes).forEach(t => { if (t !== 'SKIP') counts[t] = (counts[t] || 0) + 1; });

    let max = 0, eId = null, tie = false;
    for (const [t, c] of Object.entries(counts)) {
      if (c > max) { max = c; eId = t; tie = false; }
      else if (c === max) tie = true;
    }

    if (!tie && eId && room.players[eId]) room.players[eId].alive = false;

    const ejectedPlayer = (!tie && eId) ? room.players[eId] : null;
    const ejectedFactionName = ejectedPlayer ? (ejectedPlayer.faction === 'ZUNK' ? 'INFILTRADO ZUNK' : 'RIMK') : null;

    io.to(roomCode).emit('ejectionResult', {
      ejectedPlayer: ejectedPlayer ? ejectedPlayer.name : null,
      ejectedFaction: ejectedFactionName
    });

    if (checkVictory(roomCode)) return;
    room.turn++;
    setTimeout(() => startNightPhase(roomCode), 4000);
  }

  function checkVictory(code) {
    const room = rooms[code];
    const alv = Object.values(room.players).filter(p => p.alive);
    const z = alv.filter(p => p.faction === 'ZUNK').length;
    const r = alv.filter(p => p.faction === 'RIMK').length;

    if (z === 0) {
      io.to(code).emit('gameOver', { winner: 'OS RIMKS VENCERAM! Todos os Infiltrados Zunks foram ejetados.' });
      return true;
    }
    if (z >= r) {
      io.to(code).emit('gameOver', { winner: 'OS ZUNKS VENCERAM! A estação Alpha caiu sob controle dos Zunks.' });
      return true;
    }
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

server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
