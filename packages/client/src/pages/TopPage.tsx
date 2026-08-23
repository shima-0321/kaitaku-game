import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { socket } from '../lib/socket'
import { useGameStore } from '../hooks/useGameStore'
import { saveSession, saveLastPlayerName, loadLastPlayerName } from '../lib/session'
import { GameRulesModal } from '../components/modals/GameRulesModal'
import { CardHelpModal } from '../components/modals/CardHelpModal'
import titleImg from '../assets/title.jpg'

export function TopPage() {
  const navigate = useNavigate()
  const setIdentity = useGameStore((s) => s.setIdentity)
  const lastError = useGameStore((s) => s.lastError)
  const setLastError = useGameStore((s) => s.setLastError)
  const [playerName, setPlayerName] = useState(loadLastPlayerName())
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showCardHelp, setShowCardHelp] = useState(false)

  function handleCreateRoom() {
    const trimmed = playerName.trim()
    if (!trimmed) return setLastError('名前を入力してください')
    setBusy(true)
    setLastError(null)
    saveLastPlayerName(trimmed)
    socket.emit('create_room', { playerName: trimmed }, (ack) => {
      setBusy(false)
      if (!ack.ok) return setLastError(ack.error)
      saveSession(ack.roomCode, { playerId: ack.playerId, sessionToken: ack.sessionToken })
      setIdentity(ack.playerId, ack.roomCode)
      navigate(`/room/${ack.roomCode}`)
    })
  }

  function handleJoinRoom() {
    const trimmed = playerName.trim()
    const code = roomCodeInput.trim().toUpperCase()
    if (!trimmed) return setLastError('名前を入力してください')
    if (!code) return setLastError('ルームコードを入力してください')
    setBusy(true)
    setLastError(null)
    saveLastPlayerName(trimmed)
    socket.emit('join_room', { roomCode: code, playerName: trimmed }, (ack) => {
      setBusy(false)
      if (!ack.ok) return setLastError(ack.error)
      saveSession(ack.roomCode, { playerId: ack.playerId, sessionToken: ack.sessionToken })
      setIdentity(ack.playerId, ack.roomCode)
      navigate(`/room/${ack.roomCode}`)
    })
  }

  return (
    <div className="page top-page">
      {showRules && <GameRulesModal onClose={() => setShowRules(false)} />}
      {showCardHelp && <CardHelpModal onClose={() => setShowCardHelp(false)} />}

      <div className="top-page__hero">
        <img src={titleImg} alt="開拓GAME" className="top-page__hero-image" />
        <h1 className="top-page__hero-title">開拓GAME</h1>
      </div>

      <div className="help-buttons">
        <button type="button" onClick={() => setShowRules(true)}>
          📖 ゲーム説明
        </button>
        <button type="button" onClick={() => setShowCardHelp(true)}>
          🃏 カード説明
        </button>
      </div>

      <label className="field">
        <span>名前</span>
        <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={20} placeholder="表示名" />
      </label>

      {lastError && <p className="error-text">{lastError}</p>}

      <div className="top-page__actions">
        <button disabled={busy} onClick={handleCreateRoom}>
          ルームを作成
        </button>

        <div className="top-page__join">
          <input
            placeholder="ルームコード"
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value)}
            maxLength={8}
          />
          <button disabled={busy} onClick={handleJoinRoom}>
            参加
          </button>
        </div>
      </div>
    </div>
  )
}
