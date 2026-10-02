const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Agora a raiz '/' carrega o index.html da pasta public automaticamente
// Rotas específicas para os jogos:
app.get('/jogos/deducao', (_, res) => res.sendFile(path.join(__dirname, 'public', 'jogos', 'deducao', 'index.html')));
app.get('/jogos/ludo', (_, res) => res.sendFile(path.join(__dirname, 'public', 'jogos', 'ludo', 'index.html')));

const rooms = {};

// ============ LUDO ============
const ludo = require('./jogos/ludo');
ludo.init(io, rooms, broadcastStats);

// ============ STATUS BAR (HOME) ============
function broadcastStats() {
  const onlinePlayers = io.engine.clientsCount;
  const activeRooms = Object.keys(rooms).length;
  io.emit('statsUpdate', { onlinePlayers, activeRooms });
}

setInterval(broadcastStats, 5000);

// ============ BOTS ============
const BOT_NAMES = ['Zorblax','Kryzzt','Vexnar','Quortan','Xyloph','Braxil','Nyzoth','Vrelka','Moxxi','Zarnak','Xerath','Quinlex','Nebulon','Kryon','Xylar','Vorlox','Zephyr','Quintar','Gorblax','Yvnar','Threxil','Praxx','Worvax','Hylax','Ulnar','Kryx','Vorn','Naxor','Zynthar','Morbius'];
const BOT_FACIAL = ['none','none','9.png','10.png','11.png','12.png','13.png'];
const BOT_EYES = ['none','none','none','none','6.png','7.png'];
const BOT_SUIT = ['none','none','14.png','15.png','16.png','17.png'];
const BOT_BG = ['none','3.jpg','4.jpg','5.jpg'];

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function randomBotName(room) {
  const used = new Set(Object.values(room.players).map(p => p.name));
  for (let i = 0; i < 50; i++) {
    const n = pick(BOT_NAMES) + (Math.random() < 0.35 ? ' ' + Math.floor(Math.random() * 99 + 1) : '');
    if (!used.has(n)) return n;
  }
  return pick(BOT_NAMES) + ' ' + Date.now().toString().slice(-3);
}
function makeBot(room) {
  room.botCounter = (room.botCounter || 0) + 1;
  return {
    id: 'bot_' + room.botCounter + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: randomBotName(room),
    avatar: {
      facialHair: pick(BOT_FACIAL),
      eyewear: pick(BOT_EYES),
      suit: pick(BOT_SUIT),
      bg: pick(BOT_BG)
    },
    isHost: false, isBot: true, alive: true,
    ready: true, disconnected: false
  };
}

// ============ UTIL ============
function generateRoomCode(prefix) {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = prefix + '_';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

const ROLE_MAP = {
  ZUNK: { name: 'Infiltrado Zunk', faction: 'ZUNK' },
  BIOLOGIST: { name: 'Biólogo', faction: 'RIMK' },
  SHIELD_ENGINEER: { name: 'Engenheiro de Escudo', faction: 'RIMK' },
  RIMK_CREW: { name: 'Tripulante Rimk', faction: 'RIMK' }
};

function assignRoles(room) {
  const ids = Object.keys(room.players);
  const n = ids.length;
  const pool = ['ZUNK'];
  if (n >= 7) pool.push('ZUNK');
  if (n >= 4) pool.push('BIOLOGIST');
  if (n >= 5) pool.push('SHIELD_ENGINEER');
  while (pool.length < n) pool.push('RIMK_CREW');
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  ids.forEach((id, i) => {
    const r = ROLE_MAP[pool[i]];
    Object.assign(room.players[id], { roleKey: pool[i], role: r.name, faction: r.faction, alive: true });
  });
}

function publicList(players, viewerId) {
  const zunks = Object.values(players).filter(p => p.faction === 'ZUNK').length;
  const viewerIsZunk = viewerId && players[viewerId]?.faction === 'ZUNK';
  return Object.values(players).map(p => ({
    id: p.id, name: p.name, avatar: p.avatar, alive: p.alive,
    isHost: p.isHost, isBot: !!p.isBot, ready: !!p.ready, disconnected: !!p.disconnected,
    faction: p.alive ? null : p.faction,
    isZunkAlly: viewerIsZunk && zunks > 1 && p.faction === 'ZUNK' && p.id !== viewerId
  }));
}

function broadcastPlayers(room, event = 'playersUpdate') {
  Object.keys(room.players).forEach(pid => {
    if (room.players[pid].isBot) return;
    io.to(pid).emit(event, {
      playersList: publicList(room.players, pid),
      voteCounts: room.voteCounts || {}
    });
  });
}

function checkAllVoted(room, code) {
  const aliveCount = Object.values(room.players).filter(p => p.alive).length;
  const votesCount = Object.keys(room.votes).length;
  if (votesCount >= aliveCount) {
    clearInterval(room.timer);
    resolveVotes(code);
    return true;
  }
  return false;
}

// ============ CONNECTION ============
io.on('connection', (socket) => {

  socket.on('requestStats', () => {
    socket.emit('statsUpdate', {
      onlinePlayers: io.engine.clientsCount,
      activeRooms: Object.keys(rooms).length
    });
  });

  broadcastStats();
    
  socket.on('identify', ({ clientId }) => {
    socket.clientId = clientId;
    if (!clientId) return;
    for (const code in rooms) {
      const room = rooms[code];
      const oldId = Object.keys(room.players).find(pid => room.players[pid].clientId === clientId && room.players[pid].disconnected);
      if (oldId) {
        clearTimeout(room.players[oldId].disconnectTimer);
        const p = room.players[oldId];
        delete room.players[oldId];
        p.id = socket.id;
        p.disconnected = false;
        room.players[socket.id] = p;
        if (room.hostId === oldId) room.hostId = socket.id;
        socket.join(code);
        socket.currentRoom = code;
        socket.emit('reconnected', {
          roomCode: code, isHost: room.hostId === socket.id, state: room.state,
          roleKey: p.roleKey, role: p.role, faction: p.faction
        });
        io.to(code).emit('chatMessage', { sender: 'SISTEMA', text: `${p.name} reconectou.`, type: 'system' });
        broadcastPlayers(room);
        if (room.state === 'NOITE') socket.emit('startNight', { turn: room.turn, playersList: publicList(room.players, socket.id) });
        if (room.state === 'DIA') socket.emit('startDay', { killedPlayer: null, playersList: publicList(room.players, socket.id), voteCounts: room.voteCounts || {} });
        return;
      }
    }
  });

  socket.on('createRoom', ({ name, avatar, maxPlayers, debateMinutes, gameType }) => {
    const prefix = gameType || 'D'; // Se não vier especificado, assume 'D' de Dedução
    let code = generateRoomCode(prefix);
    while (rooms[code]) code = generateRoomCode(prefix);
    
    const limit = Math.min(Math.max(parseInt(maxPlayers) || 5, 5), 7);
    rooms[code] = {
      code, hostId: socket.id, maxPlayers: limit,
      debateTime: (parseInt(debateMinutes) || 3) * 60,
      state: 'LOBBY', players: {}, nightActions: {}, votes: {}, voteCounts: {},
      skipDebateVotes: new Set(), timer: null, timeLeft: 0, turn: 1, botCounter: 0
    };
    rooms[code].players[socket.id] = {
      id: socket.id, clientId: socket.clientId, name, avatar,
      isHost: true, isBot: false, alive: true, ready: false, disconnected: false
    };
    socket.join(code);
    socket.currentRoom = code;
    socket.emit('roomJoined', { roomCode: code, isHost: true });
    io.to(code).emit('updateQueue', { players: Object.values(rooms[code].players), maxPlayers: limit });
    broadcastStats();
  });

   socket.on('joinRoom', ({ name, avatar, roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('errorMsg', 'Sala não encontrada!');
    if (room.state !== 'LOBBY') return socket.emit('errorMsg', 'Partida já iniciada.');
    if (Object.keys(room.players).length >= room.maxPlayers) return socket.emit('errorMsg', 'Sala cheia!');
    room.players[socket.id] = {
      id: socket.id, clientId: socket.clientId, name, avatar,
      isHost: false, isBot: false, alive: true, ready: false, disconnected: false
    };
    socket.join(roomCode);
    socket.currentRoom = roomCode;
    socket.emit('roomJoined', { roomCode, isHost: false });
    io.to(roomCode).emit('updateQueue', { players: Object.values(room.players), maxPlayers: room.maxPlayers });
    broadcastStats();
  });

  socket.on('addBot', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.hostId !== socket.id) return socket.emit('errorMsg', 'Só o Host pode adicionar bots.');
    if (room.state !== 'LOBBY') return socket.emit('errorMsg', 'Só no lobby.');
    if (Object.keys(room.players).length >= room.maxPlayers) return socket.emit('errorMsg', 'Sala cheia! Remova um bot ou aumente o limite.');
    const bot = makeBot(room);
    room.players[bot.id] = bot;
    io.to(roomCode).emit('updateQueue', { players: Object.values(room.players), maxPlayers: room.maxPlayers });
  });

  socket.on('removeBot', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.state !== 'LOBBY') return;
    const botIds = Object.keys(room.players).filter(id => room.players[id].isBot);
    if (!botIds.length) return socket.emit('errorMsg', 'Não há bots para remover.');
    delete room.players[botIds[botIds.length - 1]];
    io.to(roomCode).emit('updateQueue', { players: Object.values(room.players), maxPlayers: room.maxPlayers });
  });

  socket.on('toggleReady', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'LOBBY') return;
    const p = room.players[socket.id];
    if (!p || p.isBot) return;
    p.ready = !p.ready;
    io.to(roomCode).emit('updateQueue', { players: Object.values(room.players), maxPlayers: room.maxPlayers });
  });

  socket.on('sendLobbyChat', ({ roomCode, text }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'LOBBY') return;
    const p = room.players[socket.id];
    if (!p || !text?.trim()) return;
    io.to(roomCode).emit('lobbyChatMessage', { sender: p.name, text: text.trim() });
  });

  socket.on('startGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== socket.id) return;
    const players = Object.values(room.players);
    if (players.length < 5) return socket.emit('errorMsg', 'Mínimo de 5 jogadores (humanos + bots).');
    if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Todos precisam estar prontos.');
    assignRoles(room);
    room.turn = 1;
    Object.keys(room.players).forEach(id => {
      if (room.players[id].isBot) return;
      io.to(id).emit('gameStarted', {
        roleKey: room.players[id].roleKey,
        role: room.players[id].role,
        faction: room.players[id].faction,
        playersList: publicList(room.players, id)
      });
    });
    startNightPhase(roomCode);
  });

  socket.on('playAgain', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== socket.id) return;
    clearInterval(room.timer);
    assignRoles(room);
    room.turn = 1;
    room.nightActions = {};
    room.votes = {};
    room.voteCounts = {};
    room.skipDebateVotes.clear();
    room.state = 'LOBBY';
    Object.values(room.players).forEach(p => { if (!p.isBot) p.ready = false; });
    io.to(roomCode).emit('gameRestarted', { playersList: publicList(room.players) });
    Object.keys(room.players).forEach(id => {
      if (room.players[id].isBot) return;
      io.to(id).emit('gameStarted', {
        roleKey: room.players[id].roleKey,
        role: room.players[id].role,
        faction: room.players[id].faction,
        playersList: publicList(room.players, id)
      });
    });
    startNightPhase(roomCode);
  });

  const nightAction = ({ roomCode, action, actionType, targetId }) => {
    const room = rooms[roomCode];
    const p = room?.players[socket.id];
    if (!p || !p.alive || room.state !== 'NOITE') return;
    const act = action || actionType;
    let confirmed = false;
    if ((act === 'kill' || act === 'ZUNK_KILL') && p.faction === 'ZUNK') { room.nightActions.zunk = targetId; confirmed = true; }
    else if ((act === 'shield' || act === 'SHIELD_PROTECT') && p.roleKey === 'SHIELD_ENGINEER') { room.nightActions.shield = targetId; confirmed = true; }
    else if ((act === 'scan' || act === 'BIOLOGIST_SCAN') && p.roleKey === 'BIOLOGIST') {
      const t = room.players[targetId];
      socket.emit('scanResult', { targetName: t?.name, faction: t?.faction === 'ZUNK' ? 'INFILTRADO ZUNK' : 'RIMK' });
      confirmed = true;
    }
    if (confirmed) socket.emit('actionConfirmed', { action: act, targetId, targetName: room.players[targetId]?.name });
  };
  socket.on('nightAction', nightAction);
  socket.on('submitNightAction', nightAction);

  const vote = ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'DIA' || !room.players[socket.id]?.alive) return;
    room.votes[socket.id] = targetId;
    room.voteCounts = {};
    Object.values(room.votes).forEach(t => { if (t && t !== 'SKIP') room.voteCounts[t] = (room.voteCounts[t] || 0) + 1; });
    broadcastPlayers(room);
    socket.emit('voteConfirmed', { targetId, targetName: room.players[targetId]?.name });
    checkAllVoted(room, roomCode);
  };
  socket.on('voteEject', vote);
  socket.on('submitVote', vote);

  socket.on('voteSkipDebate', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== 'DIA' || !room.players[socket.id]?.alive) return;
    room.skipDebateVotes.add(socket.id);
    io.to(roomCode).emit('updateSkipCount', room.skipDebateVotes.size);
    const aliveCount = Object.values(room.players).filter(p => p.alive).length;
    if (room.skipDebateVotes.size >= Math.ceil(aliveCount / 2)) {
      clearInterval(room.timer);
      io.to(roomCode).emit('chatMessage', { sender: 'SISTEMA', text: 'Discussão encerrada por maioria!', type: 'system' });
      resolveVotes(roomCode);
    }
  });

  const chat = ({ roomCode, text }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const p = room.players[socket.id];
    if (!p || !text?.trim()) return;
    if (!p.alive) {
      Object.values(room.players).forEach(pl => {
        if (!pl.alive && !pl.isBot) io.to(pl.id).emit('chatMessage', { sender: p.name, text, type: 'dead', channel: 'ghost' });
      });
    } else {
      if (room.state !== 'DIA' && room.state !== 'END') return;
      io.to(roomCode).emit('chatMessage', { sender: p.name, text, type: 'normal', channel: 'alive' });
    }
  };
  socket.on('sendChat', chat);
  socket.on('sendChatMessage', chat);

  socket.on('disconnect', () => {
    const code = socket.currentRoom;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    const p = room.players[socket.id];
    if (!p) return;
    p.disconnected = true;
    p.disconnectTimer = setTimeout(() => {
      if (room.players[socket.id]?.disconnected) {
        delete room.players[socket.id];
        const humansLeft = Object.values(room.players).filter(pl => !pl.isBot).length;
        if (humansLeft === 0) {
          clearInterval(room.timer);
          delete rooms[code];
             broadcastStats();
        } else {
          if (room.hostId === socket.id) {
            const nh = Object.values(room.players).find(pl => !pl.isBot)?.id;
            if (nh) {
              room.hostId = nh;
              room.players[nh].isHost = true;
              io.to(code).emit('chatMessage', { sender: 'SISTEMA', text: `${room.players[nh].name} agora é o novo Host.`, type: 'system' });
            }
          }
          broadcastPlayers(room);
        }
      }
    }, 60000);
    io.to(code).emit('chatMessage', { sender: 'SISTEMA', text: `${p.name} caiu. Aguardando reconexão...`, type: 'system' });
    broadcastPlayers(room);
  });
});

// ============ FASES ============
function startNightPhase(code) {
  const room = rooms[code];
  if (!room) return;
  room.state = 'NOITE';
  room.nightActions = {};
  room.votes = {};
  room.voteCounts = {};
  room.timeLeft = 45;
  Object.keys(room.players).forEach(pid => {
    if (room.players[pid].isBot) return;
    io.to(pid).emit('startNight', { turn: room.turn, playersList: publicList(room.players, pid) });
  });
  io.to(code).emit('timerUpdate', room.timeLeft);
  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(code).emit('timerUpdate', room.timeLeft);
    if (room.timeLeft <= 0) { clearInterval(room.timer); resolveNightPhase(code); }
  }, 1000);
  // Ações dos bots
  setTimeout(() => botNightActions(code), 7000 + Math.random() * 3000);
}

function botNightActions(code) {
  const room = rooms[code];
  if (!room || room.state !== 'NOITE') return;
  const alive = Object.values(room.players).filter(p => p.alive);
  const bots = alive.filter(p => p.isBot);
  bots.forEach(bot => {
    if (bot.faction === 'ZUNK' && !room.nightActions.zunk) {
      const targets = alive.filter(p => p.faction !== 'ZUNK');
      if (targets.length) room.nightActions.zunk = pick(targets).id;
    } else if (bot.roleKey === 'SHIELD_ENGINEER' && !room.nightActions.shield) {
      if (alive.length) room.nightActions.shield = pick(alive).id;
    }
    // Biólogo bot: só decide, sem efeito mecânico
  });
}

function resolveNightPhase(code) {
  const room = rooms[code];
  if (!room) return;
  const { zunk, shield } = room.nightActions;
  let killedId = null;
  if (zunk && zunk !== shield) {
    killedId = zunk;
    if (room.players[killedId]) room.players[killedId].alive = false;
  }
  const killedName = killedId && room.players[killedId] ? room.players[killedId].name : null;
  io.to(code).emit('playersUpdated', { playersList: publicList(room.players), voteCounts: {} });
  if (checkVictory(code)) return;
  startDayPhase(code, killedName);
}

function startDayPhase(code, killedPlayer) {
  const room = rooms[code];
  if (!room) return;
  room.state = 'DIA';
  room.votes = {};
  room.voteCounts = {};
  room.skipDebateVotes.clear();
  room.timeLeft = room.debateTime;
  Object.keys(room.players).forEach(pid => {
    if (room.players[pid].isBot) return;
    io.to(pid).emit('startDay', { killedPlayer, playersList: publicList(room.players, pid), voteCounts: {} });
  });
  io.to(code).emit('updateSkipCount', 0);
  io.to(code).emit('timerUpdate', room.timeLeft);
  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(code).emit('timerUpdate', room.timeLeft);
    if (room.timeLeft <= 0) { clearInterval(room.timer); resolveVotes(code); }
  }, 1000);
  // Votos dos bots: entre 25% e 45% do tempo de debate
  const delay = Math.min(35000, room.debateTime * 1000 * 0.3) + Math.random() * 8000;
  setTimeout(() => botVotes(code), delay);
}

function botVotes(code) {
  const room = rooms[code];
  if (!room || room.state !== 'DIA') return;
  const alive = Object.values(room.players).filter(p => p.alive);
  const bots = alive.filter(p => p.isBot);
  let changed = false;
  bots.forEach(bot => {
    if (room.votes[bot.id]) return;
    const targets = alive.filter(p => p.id !== bot.id);
    if (!targets.length) return;
    room.votes[bot.id] = pick(targets).id;
    changed = true;
  });
  if (changed) {
    room.voteCounts = {};
    Object.values(room.votes).forEach(t => { if (t && t !== 'SKIP') room.voteCounts[t] = (room.voteCounts[t] || 0) + 1; });
    broadcastPlayers(room);
    checkAllVoted(room, code);
  }
}

function resolveVotes(code) {
  const room = rooms[code];
  if (!room) return;
  const counts = {};
  Object.values(room.votes).forEach(t => { if (t && t !== 'SKIP' && t !== 'skip') counts[t] = (counts[t] || 0) + 1; });
  let max = 0, eId = null, tie = false;
  for (const [t, c] of Object.entries(counts)) {
    if (c > max) { max = c; eId = t; tie = false; }
    else if (c === max) tie = true;
  }
  let ejectedPlayerId = null;
  if (!tie && eId && room.players[eId]) {
    room.players[eId].alive = false;
    ejectedPlayerId = eId;
  }
  const ej = ejectedPlayerId ? room.players[ejectedPlayerId] : null;
  io.to(code).emit('ejectionResult', {
    ejectedPlayer: ej ? ej.name : null,
    ejectedPlayerId,
    ejectedFaction: ej ? (ej.faction === 'ZUNK' ? 'INFILTRADO ZUNK' : 'RIMK') : null
  });
  if (checkVictory(code)) return;
  room.turn++;
  setTimeout(() => startNightPhase(code), 3500);
}

function checkVictory(code) {
  const room = rooms[code];
  if (!room) return false;
  const alv = Object.values(room.players).filter(p => p.alive);
  const z = alv.filter(p => p.faction === 'ZUNK').length;
  const r = alv.filter(p => p.faction === 'RIMK').length;
  if (z === 0 || z >= r) {
    clearInterval(room.timer);
    room.state = 'END';
    io.to(code).emit('gameOver', {
      winner: z === 0 ? 'RIMK' : 'ZUNK',
      winnerText: z === 0 ? '🛸 OS RIMKS VENCERAM! Todos os Infiltrados Zunks foram ejetados.' : '👽 OS ZUNKS VENCERAM! A Estação Alpha caiu sob controle dos Zunks.',
      allPlayers: publicList(room.players).map(p => ({ ...p, faction: room.players[p.id].faction }))
    });
    return true;
  }
  return false;
}

server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
