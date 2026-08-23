import { randomInt, randomUUID } from 'node:crypto';
import type { ResourceHand, ResourceType } from '@catan-online/shared';

export function rollDie(): number {
  return randomInt(1, 7); // 1-6 inclusive
}

export function rollTwoDice(): [number, number] {
  return [rollDie(), rollDie()];
}

export function generateToken(): string {
  return randomUUID();
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O, 1/I

export function generateRoomCode(length = 5): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_CHARS[randomInt(0, ROOM_CODE_CHARS.length)];
  }
  return code;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Picks one resource card uniformly at random from a hand (weighted by count, like drawing a physical card). */
export function pickRandomResourceFromHand(hand: ResourceHand): ResourceType | null {
  const pool: ResourceType[] = [];
  for (const [resource, count] of Object.entries(hand) as [ResourceType, number][]) {
    for (let i = 0; i < count; i++) pool.push(resource);
  }
  if (pool.length === 0) return null;
  return pool[randomInt(0, pool.length)];
}
