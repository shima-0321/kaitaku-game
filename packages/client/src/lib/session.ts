export interface StoredSession {
  playerId: string
  sessionToken: string
}

function storageKey(roomCode: string): string {
  return `catan_session_${roomCode.toUpperCase()}`
}

export function saveSession(roomCode: string, session: StoredSession) {
  localStorage.setItem(storageKey(roomCode), JSON.stringify(session))
}

export function loadSession(roomCode: string): StoredSession | null {
  const raw = localStorage.getItem(storageKey(roomCode))
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredSession
  } catch {
    return null
  }
}

export function clearSession(roomCode: string) {
  localStorage.removeItem(storageKey(roomCode))
}

const PLAYER_NAME_KEY = 'catan_player_name'

export function saveLastPlayerName(name: string) {
  localStorage.setItem(PLAYER_NAME_KEY, name)
}

export function loadLastPlayerName(): string {
  return localStorage.getItem(PLAYER_NAME_KEY) ?? ''
}
