import { socket } from '../lib/socket'
import { useGameStore } from '../hooks/useGameStore'

export function LobbyPage({ roomCode }: { roomCode: string }) {
  const roomInfo = useGameStore((s) => s.roomInfo)
  const playerId = useGameStore((s) => s.playerId)
  const lastError = useGameStore((s) => s.lastError)
  const setLastError = useGameStore((s) => s.setLastError)

  if (!roomInfo) {
    return (
      <div className="page">
        <p>ロビー情報を読み込み中…</p>
      </div>
    )
  }

  const isHost = roomInfo.hostPlayerId === playerId
  const canStart = roomInfo.players.length >= 3 && roomInfo.players.length <= 4
  const roomFull = roomInfo.players.length >= 4

  function handleCopyLink() {
    const url = `${window.location.origin}/room/${roomCode}`
    navigator.clipboard?.writeText(url).catch(() => {})
  }

  function handleStart() {
    socket.emit('start_game', {}, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  function handleAddBot() {
    socket.emit('add_bot', {}, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  function handleRemoveBot(botId: string) {
    socket.emit('remove_bot', { playerId: botId }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  return (
    <div className="page lobby-page">
      <h1>待機室</h1>
      <div className="room-code-box">
        <span className="room-code-display">{roomCode}</span>
        <button onClick={handleCopyLink}>招待リンクをコピー</button>
      </div>

      <ul className="player-list">
        {roomInfo.players.map((p) => (
          <li key={p.id}>
            {p.isBot ? '\u{1F916} ' : ''}
            {p.name}
            {p.isHost && ' (ホスト)'}
            {!p.isBot && !p.connected && ' - 切断中'}
            {isHost && p.isBot && (
              <button className="player-list__remove-bot" onClick={() => handleRemoveBot(p.id)}>
                削除
              </button>
            )}
          </li>
        ))}
      </ul>

      {isHost && (
        <button disabled={roomFull} onClick={handleAddBot}>
          CPUを追加
        </button>
      )}

      {lastError && <p className="error-text">{lastError}</p>}

      {isHost ? (
        <button disabled={!canStart} onClick={handleStart}>
          ゲーム開始 ({roomInfo.players.length}/4)
        </button>
      ) : (
        <p>ホストの開始を待っています… ({roomInfo.players.length}/4)</p>
      )}
    </div>
  )
}
