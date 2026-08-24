import type { AppServer } from './context.js';
import type { Room } from '../rooms/Room.js';
import type { ResourceType } from '@catan-online/shared';
import { redactStateFor } from '../utils/stateRedaction.js';

/** Sends each connected socket its own redacted view -- never a single shared broadcast payload. */
export function broadcastState(io: AppServer, room: Room, event: 'game_started' | 'state_update') {
  for (const [socketId, playerId] of room.socketIdToPlayerId) {
    const clientState = redactStateFor(room.state, playerId);
    io.to(socketId).emit(event, clientState);
  }
}

/** Tells the robber and the victim what resource changed hands. Nobody else's socket gets this --
 * that's what keeps the theft private even though `robbed_notice` tells the whole room it happened. */
export function emitRobbedDetail(io: AppServer, room: Room, robberId: string, victimId: string, resource: ResourceType) {
  for (const [socketId, playerId] of room.socketIdToPlayerId) {
    if (playerId === robberId || playerId === victimId) {
      io.to(socketId).emit('robbed_detail', { robberId, victimId, resource });
    }
  }
}

export function broadcastRoomUpdated(io: AppServer, room: Room) {
  io.to(room.state.roomId).emit('room_updated', {
    roomCode: room.state.roomCode,
    hostPlayerId: room.state.hostPlayerId,
    boardMode: room.state.boardMode,
    players: room.state.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      isHost: p.id === room.state.hostPlayerId,
      isBot: p.isBot,
    })),
  });
}
