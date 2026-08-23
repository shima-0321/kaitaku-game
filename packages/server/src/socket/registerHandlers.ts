import type { AppServer, AppSocket } from './context.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import { registerRoomHandlers } from './handlers/room.js';
import { registerGameHandlers } from './handlers/game.js';

export function registerHandlers(io: AppServer, socket: AppSocket, roomManager: RoomManager) {
  const ctx = { io, socket, roomManager };
  registerRoomHandlers(ctx);
  registerGameHandlers(ctx);
}
