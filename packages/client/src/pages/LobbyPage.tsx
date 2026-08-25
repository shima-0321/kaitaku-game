import type { BoardMode } from '@catan-online/shared'
import { BOARD_MODE_LABELS_JA, MIN_PLAYERS, MAX_PLAYERS } from '@catan-online/shared'
import { socket } from '../lib/socket'
import { useGameStore } from '../hooks/useGameStore'

const BOARD_MODES: BoardMode[] = ['RANDOM', 'BALANCED']

/** A simple あり/なし rule toggle, shared by every boolean house rule in the lobby. */
function BooleanRulePicker({
  label,
  value,
  editable,
  onChange,
}: {
  label: string
  value: boolean
  editable: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="board-mode-picker">
      <span className="board-mode-picker__label">{label}:</span>
      {editable ? (
        <>
          <button type="button" className={!value ? 'active' : ''} onClick={() => onChange(false)}>
            なし
          </button>
          <button type="button" className={value ? 'active' : ''} onClick={() => onChange(true)}>
            あり
          </button>
        </>
      ) : (
        <span>{value ? 'あり' : 'なし'}</span>
      )}
    </div>
  )
}

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
  const canStart = roomInfo.players.length >= MIN_PLAYERS && roomInfo.players.length <= MAX_PLAYERS
  const roomFull = roomInfo.players.length >= MAX_PLAYERS

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

  function handleSetBoardMode(mode: BoardMode) {
    socket.emit('set_board_mode', { mode }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  function handleSetSpecialBuildingPhase(enabled: boolean) {
    socket.emit('set_special_building_phase', { enabled }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  function handleSetFriendlyRobber(enabled: boolean) {
    socket.emit('set_friendly_robber', { enabled }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  function handleSetSeafarers(enabled: boolean) {
    socket.emit('set_seafarers', { enabled }, (ack) => {
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

      <div className="board-mode-picker">
        <span className="board-mode-picker__label">マップ生成:</span>
        {isHost ? (
          BOARD_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={roomInfo.boardMode === mode ? 'active' : ''}
              onClick={() => handleSetBoardMode(mode)}
            >
              {BOARD_MODE_LABELS_JA[mode]}
            </button>
          ))
        ) : (
          <span>{BOARD_MODE_LABELS_JA[roomInfo.boardMode]}</span>
        )}
      </div>

      <BooleanRulePicker
        label="特別建造フェイズ"
        value={roomInfo.specialBuildingPhaseEnabled}
        editable={isHost}
        onChange={handleSetSpecialBuildingPhase}
      />

      <BooleanRulePicker label="フレンドリー・ロバー" value={roomInfo.friendlyRobberEnabled} editable={isHost} onChange={handleSetFriendlyRobber} />

      <BooleanRulePicker label="航海者版" value={roomInfo.seafarersEnabled} editable={isHost} onChange={handleSetSeafarers} />

      {lastError && <p className="error-text">{lastError}</p>}

      {isHost ? (
        <button disabled={!canStart} onClick={handleStart}>
          ゲーム開始 ({roomInfo.players.length}/{MAX_PLAYERS})
        </button>
      ) : (
        <p>ホストの開始を待っています… ({roomInfo.players.length}/{MAX_PLAYERS})</p>
      )}
    </div>
  )
}
