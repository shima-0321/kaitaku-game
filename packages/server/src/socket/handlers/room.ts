import type { HandlerContext } from '../context.js';
import { generateToken } from '../../utils/rng.js';
import { nextAvailableColor, createPlayer, createBotPlayer, nextBotName, MAX_PLAYERS } from '../../game/setup.js';
import { applyAction } from '../../game/reducer.js';
import { validateAction } from '../../game/validate.js';
import { broadcastRoomUpdated, broadcastState } from '../broadcast.js';
import { redactStateFor } from '../../utils/stateRedaction.js';
import { scheduleBotTurns } from '../../game/bot.js';

const NAME_MAX_LENGTH = 20;

export function registerRoomHandlers({ io, socket, roomManager }: HandlerContext) {
  socket.on('create_room', ({ playerName }, cb) => {
    const trimmedName = playerName.trim().slice(0, NAME_MAX_LENGTH);
    if (!trimmedName) return cb({ ok: false, error: 'name is required' });

    const playerId = generateToken();
    const sessionToken = generateToken();
    const room = roomManager.createRoom(playerId);
    const player = createPlayer(playerId, sessionToken, trimmedName, 'RED');
    room.state = { ...room.state, players: [player] };
    room.socketIdToPlayerId.set(socket.id, playerId);
    roomManager.linkSocket(socket.id, room.state.roomId);

    socket.join(room.state.roomId);
    broadcastRoomUpdated(io, room);
    cb({ ok: true, roomId: room.state.roomId, roomCode: room.state.roomCode, playerId, sessionToken });
  });

  socket.on('join_room', ({ roomCode, playerName, sessionToken }, cb) => {
    const room = roomManager.getByCode(roomCode);
    if (!room) return cb({ ok: false, error: 'room not found' });

    const reconnectTarget =
      (sessionToken && room.state.players.find((p) => p.sessionToken === sessionToken)) ||
      room.state.players.find((p) => !p.connected && p.name === playerName.trim().slice(0, NAME_MAX_LENGTH));

    if (reconnectTarget) {
      room.socketIdToPlayerId.set(socket.id, reconnectTarget.id);
      roomManager.linkSocket(socket.id, room.state.roomId);
      room.state = {
        ...room.state,
        players: room.state.players.map((p) => (p.id === reconnectTarget.id ? { ...p, connected: true } : p)),
      };
      socket.join(room.state.roomId);
      room.touch();
      broadcastRoomUpdated(io, room);
      if (room.state.phase !== 'LOBBY') {
        io.to(socket.id).emit('game_started', redactStateFor(room.state, reconnectTarget.id));
      }
      io.to(room.state.roomId).emit('player_reconnected', { playerId: reconnectTarget.id });
      return cb({
        ok: true,
        roomId: room.state.roomId,
        roomCode: room.state.roomCode,
        playerId: reconnectTarget.id,
        sessionToken: reconnectTarget.sessionToken,
      });
    }

    const trimmedName = playerName.trim().slice(0, NAME_MAX_LENGTH);
    if (!trimmedName) return cb({ ok: false, error: 'name is required' });
    if (room.state.phase !== 'LOBBY') return cb({ ok: false, error: 'game already in progress' });
    if (room.state.players.length >= MAX_PLAYERS) return cb({ ok: false, error: 'room is full' });
    if (room.state.players.some((p) => p.name === trimmedName)) {
      return cb({ ok: false, error: 'name already taken in this room' });
    }

    const color = nextAvailableColor(room.state.players);
    if (!color) return cb({ ok: false, error: 'room is full' });

    const playerId = generateToken();
    const newSessionToken = generateToken();
    const player = createPlayer(playerId, newSessionToken, trimmedName, color);
    room.state = { ...room.state, players: [...room.state.players, player] };
    room.socketIdToPlayerId.set(socket.id, playerId);
    roomManager.linkSocket(socket.id, room.state.roomId);

    socket.join(room.state.roomId);
    room.touch();
    broadcastRoomUpdated(io, room);
    cb({ ok: true, roomId: room.state.roomId, roomCode: room.state.roomCode, playerId, sessionToken: newSessionToken });
  });

  socket.on('add_bot', (_payload, cb) => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return cb({ ok: false, error: 'not in a room' });
    const playerId = room.socketIdToPlayerId.get(socket.id)!;
    if (room.state.hostPlayerId !== playerId) return cb({ ok: false, error: 'only the host can add a bot' });
    if (room.state.phase !== 'LOBBY') return cb({ ok: false, error: 'game already started' });
    if (room.state.players.length >= MAX_PLAYERS) return cb({ ok: false, error: 'room is full' });

    const color = nextAvailableColor(room.state.players);
    if (!color) return cb({ ok: false, error: 'room is full' });

    const bot = createBotPlayer(generateToken(), nextBotName(room.state.players), color);
    room.state = { ...room.state, players: [...room.state.players, bot] };
    room.touch();
    broadcastRoomUpdated(io, room);
    cb({ ok: true });
  });

  socket.on('remove_bot', ({ playerId: botId }, cb) => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return cb({ ok: false, error: 'not in a room' });
    const playerId = room.socketIdToPlayerId.get(socket.id)!;
    if (room.state.hostPlayerId !== playerId) return cb({ ok: false, error: 'only the host can remove a bot' });
    if (room.state.phase !== 'LOBBY') return cb({ ok: false, error: 'game already started' });
    const target = room.state.players.find((p) => p.id === botId);
    if (!target?.isBot) return cb({ ok: false, error: 'not a bot' });

    room.state = { ...room.state, players: room.state.players.filter((p) => p.id !== botId) };
    room.touch();
    broadcastRoomUpdated(io, room);
    cb({ ok: true });
  });

  socket.on('set_board_mode', ({ mode }, cb) => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return cb({ ok: false, error: 'not in a room' });
    const playerId = room.socketIdToPlayerId.get(socket.id)!;
    if (room.state.hostPlayerId !== playerId) return cb({ ok: false, error: 'only the host can change the board mode' });
    if (room.state.phase !== 'LOBBY') return cb({ ok: false, error: 'game already started' });
    if (mode !== 'RANDOM' && mode !== 'BALANCED') return cb({ ok: false, error: 'invalid board mode' });

    room.state = { ...room.state, boardMode: mode };
    room.touch();
    broadcastRoomUpdated(io, room);
    cb({ ok: true });
  });

  socket.on('set_special_building_phase', ({ enabled }, cb) => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return cb({ ok: false, error: 'not in a room' });
    const playerId = room.socketIdToPlayerId.get(socket.id)!;
    if (room.state.hostPlayerId !== playerId) return cb({ ok: false, error: 'only the host can change this rule' });
    if (room.state.phase !== 'LOBBY') return cb({ ok: false, error: 'game already started' });

    room.state = { ...room.state, specialBuildingPhaseEnabled: enabled };
    room.touch();
    broadcastRoomUpdated(io, room);
    cb({ ok: true });
  });

  socket.on('leave_room', (_payload, cb) => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return cb({ ok: false, error: 'not in a room' });
    const playerId = room.socketIdToPlayerId.get(socket.id)!;
    room.socketIdToPlayerId.delete(socket.id);
    roomManager.unlinkSocket(socket.id);
    room.state = {
      ...room.state,
      players: room.state.players.map((p) => (p.id === playerId ? { ...p, connected: false } : p)),
    };
    socket.leave(room.state.roomId);
    room.touch();
    broadcastRoomUpdated(io, room);
    io.to(room.state.roomId).emit('player_disconnected', { playerId });
    cb({ ok: true });
  });

  socket.on('start_game', (_payload, cb) => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return cb({ ok: false, error: 'not in a room' });
    const playerId = room.socketIdToPlayerId.get(socket.id)!;

    const validation = validateAction(room.state, { type: 'START_GAME', playerId });
    if (!validation.ok) return cb({ ok: false, error: validation.error ?? 'invalid action' });

    room.state = applyAction(room.state, { type: 'START_GAME', playerId });
    room.touch();
    broadcastState(io, room, 'game_started');
    cb({ ok: true });
    scheduleBotTurns(io, room);
  });

  socket.on('rematch', (_payload, cb) => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return cb({ ok: false, error: 'not in a room' });
    const playerId = room.socketIdToPlayerId.get(socket.id)!;

    const validation = validateAction(room.state, { type: 'REMATCH', playerId });
    if (!validation.ok) return cb({ ok: false, error: validation.error ?? 'invalid action' });

    room.state = applyAction(room.state, { type: 'REMATCH', playerId });
    room.touch();
    broadcastState(io, room, 'game_started');
    cb({ ok: true });
    scheduleBotTurns(io, room);
  });

  socket.on('disconnect', () => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;
    const playerId = room.socketIdToPlayerId.get(socket.id);
    if (!playerId) return;
    room.socketIdToPlayerId.delete(socket.id);
    roomManager.unlinkSocket(socket.id);
    room.state = {
      ...room.state,
      players: room.state.players.map((p) => (p.id === playerId ? { ...p, connected: false } : p)),
    };
    room.touch();
    broadcastRoomUpdated(io, room);
    io.to(room.state.roomId).emit('player_disconnected', { playerId });
  });
}
