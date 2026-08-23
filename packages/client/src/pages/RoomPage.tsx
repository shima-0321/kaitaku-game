import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { socket } from '../lib/socket'
import { useGameStore } from '../hooks/useGameStore'
import { loadSession, saveSession, loadLastPlayerName, saveLastPlayerName } from '../lib/session'
import { LobbyPage } from './LobbyPage'
import { GamePage } from './GamePage'

type JoinStatus = 'idle' | 'joining' | 'joined' | 'error'

/** Owns the join/reconnect flow for a room, then renders the lobby or the game board. */
export function RoomPage() {
  const { roomCode = '' } = useParams<{ roomCode: string }>()
  const normalizedCode = roomCode.toUpperCase()

  const playerId = useGameStore((s) => s.playerId)
  const currentRoomCode = useGameStore((s) => s.roomCode)
  const setIdentity = useGameStore((s) => s.setIdentity)
  const roomInfo = useGameStore((s) => s.roomInfo)
  const clientState = useGameStore((s) => s.clientState)
  const connected = useGameStore((s) => s.connected)

  const [status, setStatus] = useState<JoinStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState(loadLastPlayerName())

  const alreadyJoinedThisRoom = playerId && currentRoomCode === normalizedCode

  useEffect(() => {
    if (!connected || alreadyJoinedThisRoom || status === 'joining') return
    const stored = loadSession(normalizedCode)
    if (!stored) return

    setStatus('joining')
    socket.emit('join_room', { roomCode: normalizedCode, playerName: loadLastPlayerName(), sessionToken: stored.sessionToken }, (ack) => {
      if (!ack.ok) {
        setStatus('error')
        setError(ack.error)
        return
      }
      saveSession(ack.roomCode, { playerId: ack.playerId, sessionToken: ack.sessionToken })
      setIdentity(ack.playerId, ack.roomCode)
      setStatus('joined')
    })
  }, [connected, alreadyJoinedThisRoom, status, normalizedCode, setIdentity])

  if (alreadyJoinedThisRoom) {
    if (!clientState || clientState.phase === 'LOBBY') {
      return <LobbyPage roomCode={normalizedCode} />
    }
    return <GamePage />
  }

  if (status === 'joining') {
    return (
      <div className="page">
        <p>再接続しています…</p>
      </div>
    )
  }

  function handleJoin() {
    const trimmed = nameInput.trim()
    if (!trimmed) return setError('名前を入力してください')
    setStatus('joining')
    setError(null)
    saveLastPlayerName(trimmed)
    socket.emit('join_room', { roomCode: normalizedCode, playerName: trimmed }, (ack) => {
      if (!ack.ok) {
        setStatus('error')
        setError(ack.error)
        return
      }
      saveSession(ack.roomCode, { playerId: ack.playerId, sessionToken: ack.sessionToken })
      setIdentity(ack.playerId, ack.roomCode)
      setStatus('joined')
    })
  }

  return (
    <div className="page">
      <h1>ルームに参加</h1>
      <p className="room-code-display">コード: {normalizedCode}</p>
      <label className="field">
        <span>名前</span>
        <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={20} placeholder="表示名" />
      </label>
      {error && <p className="error-text">{error}</p>}
      {roomInfo && (
        <p>
          現在の参加者: {roomInfo.players.map((p) => p.name).join(', ') || 'なし'} ({roomInfo.players.length}/4)
        </p>
      )}
      <button onClick={handleJoin}>参加する</button>
    </div>
  )
}
