import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@catan-online/shared';
import type { RoomManager } from '../rooms/RoomManager.js';

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface HandlerContext {
  io: AppServer;
  socket: AppSocket;
  roomManager: RoomManager;
}
