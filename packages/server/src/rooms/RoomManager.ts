import { randomUUID } from 'node:crypto';
import { Room } from './Room.js';
import { createNewGameState } from '../game/setup.js';
import { generateRoomCode } from '../utils/rng.js';

const GC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ROOM_TTL_MS = 60 * 60 * 1000; // rooms with everyone disconnected for this long get swept

export class RoomManager {
  private rooms = new Map<string, Room>();
  private roomsByCode = new Map<string, string>();
  private socketIdToRoomId = new Map<string, string>();

  constructor() {
    setInterval(() => this.sweep(), GC_INTERVAL_MS).unref();
  }

  createRoom(hostPlayerId: string): Room {
    const roomId = randomUUID();
    let roomCode = generateRoomCode();
    while (this.roomsByCode.has(roomCode)) roomCode = generateRoomCode();

    const state = createNewGameState(roomId, roomCode, hostPlayerId);
    const room = new Room(state);
    this.rooms.set(roomId, room);
    this.roomsByCode.set(roomCode, roomId);
    return room;
  }

  getById(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getByCode(roomCode: string): Room | undefined {
    const roomId = this.roomsByCode.get(roomCode.toUpperCase());
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  linkSocket(socketId: string, roomId: string) {
    this.socketIdToRoomId.set(socketId, roomId);
  }

  unlinkSocket(socketId: string) {
    this.socketIdToRoomId.delete(socketId);
  }

  getRoomForSocket(socketId: string): Room | undefined {
    const roomId = this.socketIdToRoomId.get(socketId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  private sweep() {
    const now = Date.now();
    for (const [roomId, room] of this.rooms) {
      if (room.allDisconnected() && now - room.lastActivityAt > ROOM_TTL_MS) {
        this.rooms.delete(roomId);
        this.roomsByCode.delete(room.state.roomCode);
      }
    }
  }
}
