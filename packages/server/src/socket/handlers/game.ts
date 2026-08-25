import type { HandlerContext } from '../context.js';
import { dispatch, type AckFn } from '../../game/dispatch.js';
import { rollTwoDice, generateToken, pickRandomResourceFromHand } from '../../utils/rng.js';
import { scheduleBotTurns } from '../../game/bot.js';
import { emitRobbedDetail } from '../broadcast.js';
import type { Room } from '../../rooms/Room.js';
import type { RoomManager } from '../../rooms/RoomManager.js';

function resolvePlayerAction(
  roomManager: RoomManager,
  socketId: string,
  cb: AckFn,
): { room: Room; playerId: string } | null {
  const room = roomManager.getRoomForSocket(socketId);
  if (!room) {
    cb({ ok: false, error: 'not in a room' });
    return null;
  }
  const playerId = room.socketIdToPlayerId.get(socketId);
  if (!playerId) {
    cb({ ok: false, error: 'not in a room' });
    return null;
  }
  return { room, playerId };
}

export function registerGameHandlers({ io, socket, roomManager }: HandlerContext) {
  function afterHumanAction(room: Room) {
    // Give any bot whose turn/step comes next a chance to act, once the human's move settles.
    scheduleBotTurns(io, room);
  }

  socket.on('place_setup_settlement', ({ vertexId }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(io, resolved.room, { type: 'PLACE_SETUP_SETTLEMENT', playerId: resolved.playerId, vertexId }, cb);
    afterHumanAction(resolved.room);
  });

  socket.on('place_setup_road', ({ edgeId }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(io, resolved.room, { type: 'PLACE_SETUP_ROAD', playerId: resolved.playerId, edgeId }, cb);
    afterHumanAction(resolved.room);
  });

  socket.on('roll_dice', (_payload, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    const dice = rollTwoDice();
    // fire this before the state_update broadcast so clients can start the roll animation immediately
    io.to(resolved.room.state.roomId).emit('dice_rolled', { playerId: resolved.playerId, dice });
    dispatch(io, resolved.room, { type: 'ROLL_DICE', playerId: resolved.playerId, dice }, cb);
    afterHumanAction(resolved.room);
  });

  socket.on('select_discard', ({ resources }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(io, resolved.room, { type: 'SELECT_DISCARD', playerId: resolved.playerId, resources }, cb);
    afterHumanAction(resolved.room);
  });

  socket.on('move_robber', ({ hexId }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(io, resolved.room, { type: 'MOVE_ROBBER', playerId: resolved.playerId, hexId }, cb);
    afterHumanAction(resolved.room);
  });

  socket.on('move_pirate', ({ hexId }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(io, resolved.room, { type: 'MOVE_PIRATE', playerId: resolved.playerId, hexId }, cb);
    afterHumanAction(resolved.room);
  });

  socket.on('select_gold_resources', ({ resources }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(io, resolved.room, { type: 'SELECT_GOLD_RESOURCES', playerId: resolved.playerId, resources }, cb);
    afterHumanAction(resolved.room);
  });

  socket.on('steal_from', ({ targetPlayerId }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    const target = resolved.room.state.players.find((p) => p.id === targetPlayerId);
    const stolenResource = target ? pickRandomResourceFromHand(target.resources) : null;
    const hexId = resolved.room.state.board.robberHexId;
    const succeeded = dispatch(
      io,
      resolved.room,
      { type: 'STEAL_FROM', playerId: resolved.playerId, targetPlayerId, stolenResource },
      cb,
    );
    // who-stole-from-whom is public knowledge; the resource itself is not (redactStateFor hides it)
    if (succeeded) {
      io.to(resolved.room.state.roomId).emit('robbed_notice', { robberId: resolved.playerId, victimId: targetPlayerId, hexId });
      if (stolenResource) emitRobbedDetail(io, resolved.room, resolved.playerId, targetPlayerId, stolenResource);
    }
    afterHumanAction(resolved.room);
  });

  socket.on('build_road', ({ edgeId }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    const succeeded = dispatch(io, resolved.room, { type: 'BUILD_ROAD', playerId: resolved.playerId, edgeId }, cb);
    if (succeeded) io.to(resolved.room.state.roomId).emit('game_sound', { kind: 'BUILD', playerId: resolved.playerId });
    afterHumanAction(resolved.room);
  });

  socket.on('build_ship', ({ edgeId }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    const succeeded = dispatch(io, resolved.room, { type: 'BUILD_SHIP', playerId: resolved.playerId, edgeId }, cb);
    if (succeeded) io.to(resolved.room.state.roomId).emit('game_sound', { kind: 'BUILD', playerId: resolved.playerId });
    afterHumanAction(resolved.room);
  });

  socket.on('build_settlement', ({ vertexId }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    const succeeded = dispatch(io, resolved.room, { type: 'BUILD_SETTLEMENT', playerId: resolved.playerId, vertexId }, cb);
    if (succeeded) io.to(resolved.room.state.roomId).emit('game_sound', { kind: 'BUILD', playerId: resolved.playerId });
    afterHumanAction(resolved.room);
  });

  socket.on('build_city', ({ vertexId }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    const succeeded = dispatch(io, resolved.room, { type: 'BUILD_CITY', playerId: resolved.playerId, vertexId }, cb);
    if (succeeded) io.to(resolved.room.state.roomId).emit('game_sound', { kind: 'LEVEL_UP', playerId: resolved.playerId });
    afterHumanAction(resolved.room);
  });

  socket.on('buy_dev_card', (_payload, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(io, resolved.room, { type: 'BUY_DEV_CARD', playerId: resolved.playerId }, cb);
    afterHumanAction(resolved.room);
  });

  socket.on('play_dev_card', ({ devCardId, params }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    const player = resolved.room.state.players.find((p) => p.id === resolved.playerId);
    const cardType = player?.devCards.find((c) => c.id === devCardId)?.type;
    const succeeded = dispatch(io, resolved.room, { type: 'PLAY_DEV_CARD', playerId: resolved.playerId, devCardId, params }, cb);
    // broadcast so every player's client hears the effect, not just the one who played it
    if (succeeded && cardType === 'KNIGHT') {
      io.to(resolved.room.state.roomId).emit('knight_played', { playerId: resolved.playerId });
    } else if (succeeded && cardType === 'ROAD_BUILDING') {
      io.to(resolved.room.state.roomId).emit('game_sound', { kind: 'BUILD', playerId: resolved.playerId });
    }
    afterHumanAction(resolved.room);
  });

  socket.on('bank_trade', ({ give, receive }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(io, resolved.room, { type: 'BANK_TRADE', playerId: resolved.playerId, give, receive }, cb);
    afterHumanAction(resolved.room);
  });

  socket.on('propose_trade', ({ give, request, targetPlayerId }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(
      io,
      resolved.room,
      {
        type: 'PROPOSE_TRADE',
        playerId: resolved.playerId,
        tradeId: generateToken(),
        give,
        request,
        targetPlayerId: targetPlayerId ?? null,
      },
      cb,
    );
    afterHumanAction(resolved.room);
  });

  socket.on('respond_trade', ({ tradeId, accept }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(io, resolved.room, { type: 'RESPOND_TRADE', playerId: resolved.playerId, tradeId, accept }, cb);
    afterHumanAction(resolved.room);
  });

  socket.on('cancel_trade', ({ tradeId }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(io, resolved.room, { type: 'CANCEL_TRADE', playerId: resolved.playerId, tradeId }, cb);
    afterHumanAction(resolved.room);
  });

  socket.on('finalize_trade', ({ tradeId, withPlayerId }, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(io, resolved.room, { type: 'FINALIZE_TRADE', playerId: resolved.playerId, tradeId, withPlayerId }, cb);
    afterHumanAction(resolved.room);
  });

  socket.on('end_turn', (_payload, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(io, resolved.room, { type: 'END_TURN', playerId: resolved.playerId }, cb);
    afterHumanAction(resolved.room);
  });

  socket.on('pass_special_build', (_payload, cb) => {
    const resolved = resolvePlayerAction(roomManager, socket.id, cb);
    if (!resolved) return;
    dispatch(io, resolved.room, { type: 'PASS_SPECIAL_BUILD', playerId: resolved.playerId }, cb);
    afterHumanAction(resolved.room);
  });
}
