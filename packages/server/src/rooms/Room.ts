import type { GameState } from '@catan-online/shared';

export class Room {
  state: GameState;
  socketIdToPlayerId = new Map<string, string>();
  lastActivityAt: number = Date.now();

  constructor(state: GameState) {
    this.state = state;
  }

  touch() {
    this.lastActivityAt = Date.now();
  }

  allDisconnected(): boolean {
    return this.state.players.length > 0 && this.state.players.every((p) => !p.connected);
  }
}
