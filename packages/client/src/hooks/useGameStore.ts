import { create } from 'zustand'
import type { ClientGameState, RoomUpdatedPayload, GameOverPayload, DiceRolledPayload, RobbedDetailPayload } from '@catan-online/shared'

interface GameStore {
  connected: boolean
  roomInfo: RoomUpdatedPayload | null
  clientState: ClientGameState | null
  playerId: string | null
  roomCode: string | null
  lastError: string | null
  gameOverPayload: GameOverPayload | null
  diceRollEvent: DiceRolledPayload | null
  robbedDetailEvent: RobbedDetailPayload | null

  setConnected: (connected: boolean) => void
  setRoomInfo: (info: RoomUpdatedPayload) => void
  setClientState: (state: ClientGameState) => void
  setIdentity: (playerId: string, roomCode: string) => void
  setLastError: (message: string | null) => void
  setGameOverPayload: (payload: GameOverPayload) => void
  setDiceRollEvent: (payload: DiceRolledPayload) => void
  setRobbedDetailEvent: (payload: RobbedDetailPayload) => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set) => ({
  connected: false,
  roomInfo: null,
  clientState: null,
  playerId: null,
  roomCode: null,
  lastError: null,
  gameOverPayload: null,
  diceRollEvent: null,
  robbedDetailEvent: null,

  setConnected: (connected) => set({ connected }),
  setRoomInfo: (roomInfo) => set({ roomInfo }),
  setClientState: (clientState) => set({ clientState }),
  setIdentity: (playerId, roomCode) => set({ playerId, roomCode }),
  setLastError: (lastError) => set({ lastError }),
  setGameOverPayload: (gameOverPayload) => set({ gameOverPayload }),
  setDiceRollEvent: (diceRollEvent) => set({ diceRollEvent }),
  setRobbedDetailEvent: (robbedDetailEvent) => set({ robbedDetailEvent }),
  reset: () =>
    set({
      roomInfo: null,
      clientState: null,
      playerId: null,
      roomCode: null,
      lastError: null,
      gameOverPayload: null,
      diceRollEvent: null,
      robbedDetailEvent: null,
    }),
}))
