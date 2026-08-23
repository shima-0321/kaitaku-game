import type { Ack } from '@catan-online/shared';
import type { GameAction } from './actions.js';
import { validateAction } from './validate.js';
import { applyAction } from './reducer.js';
import { broadcastState } from '../socket/broadcast.js';
import { calculateTotalVictoryPoints, calculateScoreBreakdown } from './scoring.js';
import type { Room } from '../rooms/Room.js';
import type { AppServer } from '../socket/context.js';

export type AckFn = (response: Ack) => void;

/** Validates + applies a game action, broadcasts the resulting state to every socket in the room,
 * and fires game_over if this action just won it. Shared by human socket handlers and the bot AI
 * so both go through the exact same rules. */
export function dispatch(io: AppServer, room: Room, action: GameAction, cb: AckFn): boolean {
  const validation = validateAction(room.state, action);
  if (!validation.ok) {
    cb({ ok: false, error: validation.error ?? 'invalid action' });
    return false;
  }
  const hadWinnerBefore = room.state.winnerId !== null;
  room.state = applyAction(room.state, action);
  room.touch();
  broadcastState(io, room, 'state_update');
  cb({ ok: true });

  if (!hadWinnerBefore && room.state.winnerId) {
    const finalScores = room.state.players.map((p) => ({
      playerId: p.id,
      points: calculateTotalVictoryPoints(room.state, p.id),
      breakdown: calculateScoreBreakdown(room.state, p.id),
    }));
    io.to(room.state.roomId).emit('game_over', { winnerId: room.state.winnerId, finalScores });
  }

  return true;
}
