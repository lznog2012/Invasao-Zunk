// ================================================
// LUDO ALIENÍGENA - Servidor
// ================================================

const COLORS_A = [
  { name: 'Rimk',   hex: '#aaff00', dark: '#557700', planet: 'Rimkópolis' },
  { name: 'Sahrin', hex: '#ffcc00', dark: '#886600', planet: 'Kaal-7'      },
  { name: 'Nereid', hex: '#00ffcc', dark: '#006655', planet: 'Nereida'     },
  { name: 'Ferrum', hex: '#ff3344', dark: '#881122', planet: 'Marte'       }
];

const COLORS_B = [
  { name: 'Rimk',   hex: '#aaff00', dark: '#557700', team: 'RIMK', planet: 'Rimkópolis' },
  { name: 'Thrakk', hex: '#f0f0ff', dark: '#8888aa', team: 'ZUNK', planet: "Zunk'nir"    },
  { name: 'Nereid', hex: '#00ffcc', dark: '#006655', team: 'RIMK', planet: 'Nereida'     },
  { name: 'Vharn',  hex: '#aa66ff', dark: '#553388', team: 'ZUNK', planet: "Zunk'nir"    }
];

const START_INDICES = [0, 13, 26, 39];
const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const TURN_TIME = 30;
const DISCONNECT_GRACE = 30;
const MAX_SIXES = 3;
const FINISH_POS = 56;
const BOT_NAMES = ['Zorblax','Kryzzt','Vexnar','Quortan','Xyloph','Braxil','Nyzoth','Vrelka','Moxxi','Zarnak','Xerath','Quinlex','Nebulon','Kryon','Xylar','Vorlox','Zephyr','Quintar','Gorblax','Yvnar'];

function init(io, rooms, broadcastStats) {
  // ========== BOTS ==========
  function pickBotName(room) {
    const used = new Set(Object.values(room.players).map(p => p.name));
    for (let i = 0; i < 30; i++) {
      const n = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
        + (Math.random() < 0.3 ? ' ' + Math.floor(Math.random() * 99 + 1) : '');
      if (!used.has(n)) return n;
    }
    return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '_' + Date.now().toString().slice(-3);
  }

  function pickBotMove(player, dice) {
    const valid = [];
    player.pawns.forEach((pos, idx) => {
      if (canMovePawn(pos, dice)) valid.push({ idx, pos });
    });
    if (!valid.length) return null;
    // Prioriza peões já no tabuleiro (mais úteis) e, entre eles, o mais avançado
    const onBoard = valid.filter(v => v.pos !== -1);
    const pool = onBoard.length ? onBoard : valid;
    pool.sort((a, b) => b.pos - a.pos);
    return pool[0].idx;
  }

  function scheduleBotTurn(room) {
    if (room.state !== 'PLAYING') return;
    const currentId = room.turnOrder[room.currentTurn];
    if (!currentId) return;
    const p = room.players[currentId];
    if (!p || !p.isBot || p.eliminated) return;
    if (room.dice !== null) return;

    setTimeout(() => {
      const r = rooms[room.code];
      if (!r || r.state !== 'PLAYING') return;
      if (r.turnOrder[r.currentTurn] !== currentId) return;
      if (r.dice !== null) return;
      performRoll(r, currentId);
    }, 1200 + Math.random() * 900);
  }

    function performRoll(room, playerId) {
    if (room.state !== 'PLAYING') return;
    const player = room.players[playerId];
    if (!player || player.eliminated) return;
    if (room.dice !== null) return;
    if (room.turnOrder[room.currentTurn] !== playerId) return;

    const dice = rollDice();
    room.dice = dice;

    if (dice === 6) {
      room.sixesInARow++;
      if (room.sixesInARow > MAX_SIXES) {
        io.to(room.code).emit('ludoChat', {
          sender: 'SISTEMA',
          text: `⚀ ${player.name} tirou 6 três vezes! Perdeu o turno.`,
          type: 'system'
        });
        nextTurn(room);
        return;
      }
    } else {
      room.sixesInARow = 0;
    }

    const anyMove = hasAnyMove(player, dice);
    io.to(room.code).emit('ludoDiceRolled', {
      playerId, playerName: player.name, dice, anyMove
    });
    broadcastState(room);

        if (!anyMove) {
      io.to(room.code).emit('ludoChat', {
        sender: 'SISTEMA',
        text: `🎲 ${player.name} tirou ${dice}, mas não tem jogadas válidas.`,
        type: 'system'
      });
      setTimeout(() => {
        const r = rooms[room.code];
        if (r && r.state === 'PLAYING' && r.dice === dice) nextTurn(r);
      }, 2000);
      return;
    }

    // Conta quantos peões podem mover
    const validMoves = [];
    player.pawns.forEach((pos, idx) => {
      if (canMovePawn(pos, dice)) validMoves.push(idx);
    });

    // AUTO-MOVE: se só tem 1 jogada válida, move sozinho (humano E bot)
    if (validMoves.length === 1) {
      const delay = player.isBot ? 1300 : 1000;
      setTimeout(() => {
        const r = rooms[room.code];
        if (!r || r.state !== 'PLAYING') return;
        if (r.dice !== dice) return;
        if (r.turnOrder[r.currentTurn] !== playerId) return;

        if (!player.isBot) {
          io.to(room.code).emit('ludoChat', {
            sender: 'SISTEMA',
            text: `⚡ Movimento automático (única jogada válida).`,
            type: 'system'
          });
        }
        performMove(r, playerId, validMoves[0]);
      }, delay);
      return;
    }

    // Se for bot com múltiplas jogadas, escolhe sozinho
    if (player.isBot) {
      setTimeout(() => {
        const r = rooms[room.code];
        if (!r || r.state !== 'PLAYING') return;
        if (r.dice !== dice) return;
        const pawnIdx = pickBotMove(player, dice);
        if (pawnIdx !== null) performMove(r, playerId, pawnIdx);
      }, 1300);
    }
  }

    // Se for bot, auto-move
    if (player.isBot) {
      setTimeout(() => {
        const r = rooms[room.code];
        if (!r || r.state !== 'PLAYING') return;
        if (r.dice !== dice) return;
        const pawnIdx = pickBotMove(player, dice);
        if (pawnIdx !== null) performMove(r, playerId, pawnIdx);
      }, 1300);
    }
  }

  function performMove(room, playerId, pawnIndex) {
    if (room.state !== 'PLAYING') return;
    if (room.turnOrder[room.currentTurn] !== playerId) return;
    if (room.dice === null) return;

    const captured = applyMove(room, playerId, pawnIndex);
    if (captured === false) return;

    if (Array.isArray(captured) && captured.length) {
      io.to(room.code).emit('ludoCapture', { captured });
    }
    broadcastState(room);
  }
  
  // ========== HELPERS ==========
  function rollDice() { return Math.floor(Math.random() * 6) + 1; }

  function getColors(mode) { return mode === 'B' ? COLORS_B : COLORS_A; }

  function canMovePawn(pawnPos, dice) {
    if (pawnPos === -1) return dice === 6;
    if (pawnPos >= FINISH_POS) return false;
    if (pawnPos + dice > FINISH_POS) return false;
    return true;
  }

  function hasAnyMove(player, dice) {
    return player.pawns.some(p => canMovePawn(p, dice));
  }

  function getRingIndex(playerIndex, relativePos) {
    return (START_INDICES[playerIndex] + relativePos) % 52;
  }

  // ========== ROOM MANAGEMENT ==========
  function makeRoom(code, hostId, mode, maxPlayers) {
    return {
      code,
      gameType: 'L',
      mode,
      maxPlayers,
      hostId,
      state: 'LOBBY',
      players: {},
      turnOrder: [],
      currentTurn: 0,
      dice: null,
      sixesInARow: 0,
      turnTimer: null,
      turnTimeLeft: 0,
      disconnectTimers: {}
    };
  }

  function publicState(room) {
    return {
      code: room.code,
      mode: room.mode,
      state: room.state,
      maxPlayers: room.maxPlayers,
      hostId: room.hostId,
      currentTurnId: room.turnOrder[room.currentTurn] || null,
      dice: room.dice,
      turnTimeLeft: room.turnTimeLeft,
      players: Object.values(room.players).map(p => ({
        id: p.id, name: p.name, avatar: p.avatar,
        color: p.color, colorName: p.colorName, team: p.team || null,
        isHost: p.isHost, isBot: !!p.isBot, ready: p.ready, disconnected: p.disconnected,
        pawns: [...p.pawns], finished: p.finished, eliminated: p.eliminated,
        playerIndex: p.playerIndex
      }))
    };
  }

  function broadcastState(room) {
    io.to(room.code).emit('ludoState', publicState(room));
  }

  function broadcastLobby(room) {
    io.to(room.code).emit('ludoLobby', {
      code: room.code,
      mode: room.mode,
      maxPlayers: room.maxPlayers,
      hostId: room.hostId,
      players: Object.values(room.players).map(p => ({
        id: p.id, name: p.name, avatar: p.avatar,
        color: p.color, colorName: p.colorName, team: p.team || null,
        isHost: p.isHost, isBot: !!p.isBot, ready: p.ready, disconnected: p.disconnected,
        playerIndex: p.playerIndex
      }))
    });
  }

  function nextTurn(room) {
    clearInterval(room.turnTimer);
    room.dice = null;
    room.sixesInARow = 0;
    if (!room.turnOrder.length) return;
    let attempts = 0;
    do {
      room.currentTurn = (room.currentTurn + 1) % room.turnOrder.length;
      attempts++;
      const pid = room.turnOrder[room.currentTurn];
      const p = room.players[pid];
      if (p && !p.eliminated) break;
    } while (attempts < room.turnOrder.length);
    startTurnTimer(room);
    broadcastState(room);
  }

  function startTurnTimer(room) {
    clearInterval(room.turnTimer);
    room.turnTimeLeft = TURN_TIME;
    io.to(room.code).emit('ludoTimer', room.turnTimeLeft);
    room.turnTimer = setInterval(() => {
      room.turnTimeLeft--;
      io.to(room.code).emit('ludoTimer', room.turnTimeLeft);
      if (room.turnTimeLeft <= 0) {
        clearInterval(room.turnTimer);
        const pid = room.turnOrder[room.currentTurn];
        const p = room.players[pid];
        io.to(room.code).emit('ludoChat', {
          sender: 'SISTEMA',
          text: `⏱ ${p?.name || 'Jogador'} demorou demais. Turno passado.`,
          type: 'system'
        });
        nextTurn(room);
      }
    }, 1000);

    scheduleBotTurn(room);
  }

  // ========== GAME LOGIC ==========
  function applyMove(room, playerId, pawnIndex) {
    const player = room.players[playerId];
    const dice = room.dice;
    const pos = player.pawns[pawnIndex];

    if (!canMovePawn(pos, dice)) return false;

    const newPos = pos === -1 ? 0 : pos + dice;
    player.pawns[pawnIndex] = newPos;

    // Captura (apenas se caiu no anel, 0-50)
    const captured = [];
    if (newPos >= 0 && newPos <= 50) {
      const ringIdx = getRingIndex(player.playerIndex, newPos);
      if (!SAFE_INDICES.has(ringIdx)) {
        Object.values(room.players).forEach(other => {
          if (other.id === playerId || other.eliminated) return;
          other.pawns.forEach((op, oi) => {
            if (op >= 0 && op <= 50) {
              const oRingIdx = getRingIndex(other.playerIndex, op);
              if (oRingIdx === ringIdx) {
                other.pawns[oi] = -1;
                captured.push({ playerId: other.id, playerName: other.name, pawnIndex: oi });
              }
            }
          });
        });
      }
    }

    // Verifica fim de jogo
    if (player.pawns.every(p => p === FINISH_POS)) {
      player.finished = true;
      if (checkWin(room)) return captured;
    }

    // Re-rolar se tirou 6
    if (dice === 6) {
      if (room.sixesInARow >= MAX_SIXES) {
        room.sixesInARow = 0;
        nextTurn(room);
      } else {
        room.dice = null;
        io.to(room.code).emit('ludoRollAgain', { playerId });
        startTurnTimer(room);
        broadcastState(room);
      }
    } else {
      nextTurn(room);
    }

    return captured;
  }

  function checkWin(room) {
    if (room.mode === 'A') {
      const winner = Object.values(room.players).find(p => p.finished);
      if (winner) { endGame(room, [winner.id]); return true; }
    } else {
      const rimk = Object.values(room.players).filter(p => p.team === 'RIMK');
      const zunk = Object.values(room.players).filter(p => p.team === 'ZUNK');
      if (rimk.length && rimk.every(p => p.finished)) { endGame(room, rimk.map(p => p.id)); return true; }
      if (zunk.length && zunk.every(p => p.finished)) { endGame(room, zunk.map(p => p.id)); return true; }
    }
    return false;
  }

  function endGame(room, winnerIds) {
    room.state = 'END';
    clearInterval(room.turnTimer);
    io.to(room.code).emit('ludoEnd', {
      winnerIds,
      players: Object.values(room.players).map(p => ({
        id: p.id, name: p.name, color: p.color, team: p.team || null,
        pawns: p.pawns, finished: p.finished
      }))
    });
  }

  function handleLeave(room, playerId) {
    if (!room.players[playerId]) return;
    const p = room.players[playerId];

    if (room.disconnectTimers[playerId]) {
      clearTimeout(room.disconnectTimers[playerId]);
      delete room.disconnectTimers[playerId];
    }

    if (room.state === 'LOBBY') {
      delete room.players[playerId];
      room.turnOrder = room.turnOrder.filter(id => id !== playerId);
      if (room.hostId === playerId && room.turnOrder.length) {
        room.hostId = room.turnOrder[0];
        room.players[room.hostId].isHost = true;
      }
      if (!room.turnOrder.length) {
        delete rooms[room.code];
        if (typeof broadcastStats === 'function') broadcastStats();
      } else {
        const colors = getColors(room.mode);
        Object.values(room.players).forEach((pl, i) => {
          pl.playerIndex = i;
          pl.color = colors[i].hex;
          pl.colorName = colors[i].name;
          pl.team = colors[i].team || null;
        });
        broadcastLobby(room);
      }
    } else if (room.state === 'PLAYING') {
      p.eliminated = true;
      p.disconnected = true;
      p.pawns = [-1, -1, -1, -1];
      io.to(room.code).emit('ludoChat', {
        sender: 'SISTEMA',
        text: `⚠ ${p.name} foi desclassificado.`,
        type: 'system'
      });

      const activePlayers = Object.values(room.players).filter(pl => !pl.eliminated);
      if (activePlayers.length <= 1) {
        if (activePlayers.length === 1) endGame(room, [activePlayers[0].id]);
        else { room.state = 'END'; clearInterval(room.turnTimer); }
        return;
      }

      const currentId = room.turnOrder[room.currentTurn];
      if (currentId === playerId) nextTurn(room);
      else broadcastState(room);
    }

    io.to(room.code).emit('ludoPlayerLeft', { playerId, playerName: p.name });
  }

  // ========== SOCKET HANDLERS ==========
  io.on('connection', (socket) => {

    socket.on('ludoCreate', ({ name, avatar, mode, maxPlayers }) => {
      let code;
      do {
        code = 'L_' + Math.random().toString(36).slice(2, 6).toUpperCase();
      } while (rooms[code]);

      const limit = Math.min(Math.max(parseInt(maxPlayers) || 4, 2), 4);
      const m = mode === 'B' ? 'B' : 'A';
      const colors = getColors(m);

      rooms[code] = makeRoom(code, socket.id, m, limit);
      rooms[code].players[socket.id] = {
        id: socket.id, name, avatar,
        color: colors[0].hex, colorName: colors[0].name, team: colors[0].team || null,
        playerIndex: 0, isHost: true, ready: false, disconnected: false,
        pawns: [-1, -1, -1, -1], finished: false, eliminated: false
      };
      rooms[code].turnOrder = [socket.id];
      
      socket.join(code);
      socket.currentRoom = code;
      socket.emit('ludoJoined', { code, isHost: true });
      broadcastLobby(rooms[code]);
      if (typeof broadcastStats === 'function') broadcastStats();
    });

    socket.on('ludoJoin', ({ name, avatar, code }) => {
      const room = rooms[code];
      if (!room || room.gameType !== 'L') return socket.emit('errorMsg', 'Sala não encontrada.');
      if (room.state !== 'LOBBY') return socket.emit('errorMsg', 'Partida já iniciada.');
      if (Object.keys(room.players).length >= room.maxPlayers) return socket.emit('errorMsg', 'Sala cheia.');

      const colors = getColors(room.mode);
      const idx = Object.keys(room.players).length;
      const color = colors[idx];

      room.players[socket.id] = {
        id: socket.id, name, avatar,
        color: color.hex, colorName: color.name, team: color.team || null,
        playerIndex: idx, isHost: false, ready: false, disconnected: false,
        pawns: [-1, -1, -1, -1], finished: false, eliminated: false
      };
      room.turnOrder.push(socket.id);

      socket.join(code);
      socket.currentRoom = code;
      socket.emit('ludoJoined', { code, isHost: false });
      broadcastLobby(room);
    });

    socket.on('ludoReady', ({ code }) => {
      const room = rooms[code];
      if (!room || room.state !== 'LOBBY') return;
      const p = room.players[socket.id];
      if (!p) return;
      p.ready = !p.ready;
      broadcastLobby(room);
    });

    socket.on('ludoAddBot', ({ code }) => {
      const room = rooms[code];
      if (!room || room.hostId !== socket.id) return;
      if (room.state !== 'LOBBY') return;
      const idx = Object.keys(room.players).length;
      if (idx >= room.maxPlayers) return socket.emit('errorMsg', 'Sala cheia.');
      const colors = getColors(room.mode);
      const color = colors[idx];
      const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      room.players[botId] = {
        id: botId,
        name: pickBotName(room),
        avatar: {},
        color: color.hex, colorName: color.name, team: color.team || null,
        playerIndex: idx, isHost: false, isBot: true, ready: true, disconnected: false,
        pawns: [-1, -1, -1, -1], finished: false, eliminated: false
      };
      room.turnOrder.push(botId);
      broadcastLobby(room);
    });

    socket.on('ludoRemoveBot', ({ code }) => {
      const room = rooms[code];
      if (!room || room.hostId !== socket.id) return;
      if (room.state !== 'LOBBY') return;
      const botIds = Object.keys(room.players).filter(id => room.players[id].isBot);
      if (!botIds.length) return socket.emit('errorMsg', 'Não há bots para remover.');
      const botId = botIds[botIds.length - 1];
      delete room.players[botId];
      room.turnOrder = room.turnOrder.filter(id => id !== botId);
      // Renumera índices e cores
      const colors = getColors(room.mode);
      Object.values(room.players).forEach((pl, i) => {
        pl.playerIndex = i;
        pl.color = colors[i].hex;
        pl.colorName = colors[i].name;
        pl.team = colors[i].team || null;
      });
      broadcastLobby(room);
    });
    
        socket.on('ludoStart', ({ code }) => {
      const room = rooms[code];
      if (!room || room.hostId !== socket.id) return;

      const num = Object.keys(room.players).length;
      if (num < 2) return socket.emit('errorMsg', 'Mínimo 2 jogadores.');

      if (room.mode === 'B' && num !== 2 && num !== 4) {
        return socket.emit('errorMsg', 'O modo 2v2 exige 2 ou 4 jogadores.');
      }

      if (!Object.values(room.players).every(p => p.ready)) {
        return socket.emit('errorMsg', 'Todos precisam estar prontos.');
      }

      room.state = 'PLAYING';
      room.currentTurn = 0;
      room.dice = null;
      room.sixesInARow = 0;

      io.to(code).emit('ludoStarted', publicState(room));
      startTurnTimer(room);
    });

   socket.on('ludoRoll', ({ code }) => {
      const room = rooms[code];
      if (!room || room.state !== 'PLAYING') return;
      if (room.turnOrder[room.currentTurn] !== socket.id) return;
      performRoll(room, socket.id);
    });

    socket.on('ludoMove', ({ code, pawnIndex }) => {
      const room = rooms[code];
      if (!room || room.state !== 'PLAYING') return;
      if (room.turnOrder[room.currentTurn] !== socket.id) return;
      performMove(room, socket.id, pawnIndex);
    });

    socket.on('ludoChat', ({ code, text }) => {
      const room = rooms[code];
      if (!room) return;
      const p = room.players[socket.id];
      if (!p || !text?.trim()) return;
      io.to(code).emit('ludoChat', { sender: p.name, text: text.trim(), type: 'normal' });
    });

    socket.on('ludoLeave', ({ code }) => {
      const room = rooms[code];
      if (!room) return;
      handleLeave(room, socket.id);
    });

    socket.on('disconnect', () => {
      const code = socket.currentRoom;
      if (!code || !rooms[code]) return;
      const room = rooms[code];
      if (room.gameType !== 'L') return;
      if (!room.players[socket.id]) return;

      room.players[socket.id].disconnected = true;
      broadcastLobby(room);
      broadcastState(room);

      room.disconnectTimers[socket.id] = setTimeout(() => {
        if (rooms[code] && rooms[code].players[socket.id]?.disconnected) {
          handleLeave(rooms[code], socket.id);
        }
      }, DISCONNECT_GRACE * 1000);
    });
  });
}

module.exports = { init };
