import { useEffect, useState } from 'react'
import type { ResourceHand, ResourceType, TradeOffer } from '@catan-online/shared'
import { calculateTradeRatios, canAfford, RESOURCE_LABELS_JA as RESOURCE_LABELS } from '@catan-online/shared'
import { socket } from '../../lib/socket'
import { useGameStore } from '../../hooks/useGameStore'

const RESOURCES: ResourceType[] = ['BRICK', 'LUMBER', 'WOOL', 'GRAIN', 'ORE']

const RESOURCE_SWATCH_COLORS: Record<ResourceType, string> = {
  BRICK: '#c1622d',
  LUMBER: '#2e7d32',
  WOOL: '#8bc34a',
  GRAIN: '#f9d94f',
  ORE: '#78909c',
}

type Hand = Record<ResourceType, number>

function emptyHand(): Hand {
  return { BRICK: 0, LUMBER: 0, WOOL: 0, GRAIN: 0, ORE: 0 }
}

function nonZeroEntries(hand: Hand): Partial<ResourceHand> {
  return Object.fromEntries(Object.entries(hand).filter(([, v]) => v > 0)) as Partial<ResourceHand>
}

function describeTrade(trade: TradeOffer): string {
  const give = Object.entries(trade.give)
    .map(([res, amt]) => `${RESOURCE_LABELS[res as ResourceType]}${amt}`)
    .join('+')
  const request = Object.entries(trade.request)
    .map(([res, amt]) => `${RESOURCE_LABELS[res as ResourceType]}${amt}`)
    .join('+')
  return `${give || '(なし)'} → ${request || '(なし)'}`
}

function ResourcePicker({
  label,
  values,
  onChange,
  max,
  owned,
}: {
  label: string
  values: Hand
  onChange: (next: Hand) => void
  max?: Hand
  owned?: Hand
}) {
  return (
    <div className="resource-picker">
      <span className="resource-picker__label">{label}</span>
      {RESOURCES.map((res) => (
        <div key={res} className="resource-picker__row">
          <span className="resource-picker__swatch" style={{ background: RESOURCE_SWATCH_COLORS[res] }} />
          <span className="resource-picker__name">
            {RESOURCE_LABELS[res]}
            {owned && <span className="resource-picker__owned">(所持{owned[res]})</span>}
          </span>
          <button type="button" onClick={() => onChange({ ...values, [res]: Math.max(0, values[res] - 1) })}>
            -
          </button>
          <span className="resource-picker__count">{values[res]}</span>
          <button
            type="button"
            disabled={max ? values[res] >= max[res] : false}
            onClick={() => onChange({ ...values, [res]: values[res] + 1 })}
          >
            +
          </button>
        </div>
      ))}
    </div>
  )
}

export function TradePanel() {
  const clientState = useGameStore((s) => s.clientState)
  const playerId = useGameStore((s) => s.playerId)
  const setLastError = useGameStore((s) => s.setLastError)

  const [bankGive, setBankGive] = useState<Hand>(emptyHand())
  const [bankReceive, setBankReceive] = useState<Hand>(emptyHand())
  const [proposeGive, setProposeGive] = useState<Hand>(emptyHand())
  const [proposeRequest, setProposeRequest] = useState<Hand>(emptyHand())
  const [targetPlayerId, setTargetPlayerId] = useState<string>('')

  // Clear the picker counts whenever the turn changes (start or end) -- otherwise a number picked
  // while proposing a trade on one turn stays selected and silently carries into the next turn's offer.
  const turnNumber = clientState?.turn?.turnNumber
  useEffect(() => {
    setBankGive(emptyHand())
    setBankReceive(emptyHand())
    setProposeGive(emptyHand())
    setProposeRequest(emptyHand())
    setTargetPlayerId('')
  }, [turnNumber])

  if (!clientState || !playerId) return null

  const me = clientState.me
  const isMyTurn = clientState.phase === 'PLAYING' && clientState.turn?.currentPlayerId === playerId
  const canTradeNow = isMyTurn && !!clientState.turn?.hasRolled && !clientState.turn.pendingRobber
  const ratios = calculateTradeRatios(clientState.board, playerId)

  function handleBankTrade() {
    const give = nonZeroEntries(bankGive)
    const receive = nonZeroEntries(bankReceive)
    socket.emit('bank_trade', { give, receive }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
      else {
        setBankGive(emptyHand())
        setBankReceive(emptyHand())
      }
    })
  }

  function handleProposeTrade() {
    const give = nonZeroEntries(proposeGive)
    const request = nonZeroEntries(proposeRequest)
    socket.emit('propose_trade', { give, request, targetPlayerId: targetPlayerId || null }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
      else {
        setProposeGive(emptyHand())
        setProposeRequest(emptyHand())
      }
    })
  }

  function handleRespond(tradeId: string, accept: boolean) {
    socket.emit('respond_trade', { tradeId, accept }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  function handleCancel(tradeId: string) {
    socket.emit('cancel_trade', { tradeId }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  const pendingTrades = clientState.turn?.pendingTrades ?? []
  const incomingTrades = pendingTrades.filter((t) => t.proposerId !== playerId && (t.targetId === null || t.targetId === playerId))
  const myProposedTrades = pendingTrades.filter((t) => t.proposerId === playerId)

  return (
    <section className="trade-panel">
      <h2>交易</h2>

      {canTradeNow && (
        <>
          <details>
            <summary>
              銀行と交易 (比率 レンガ{ratios.BRICK}:1 木材{ratios.LUMBER}:1 羊毛{ratios.WOOL}:1 麦{ratios.GRAIN}:1 鉱石{ratios.ORE}:1)
            </summary>
            <div className="resource-picker-pair">
              <ResourcePicker label="渡す" values={bankGive} onChange={setBankGive} max={me.resources} owned={me.resources} />
              <span className="resource-picker-pair__arrow">→</span>
              <ResourcePicker label="受け取る" values={bankReceive} onChange={setBankReceive} />
            </div>
            <button onClick={handleBankTrade}>銀行と交易する</button>
          </details>

          <details>
            <summary>プレイヤーに提案</summary>
            <div className="resource-picker-pair">
              <ResourcePicker label="渡す" values={proposeGive} onChange={setProposeGive} max={me.resources} owned={me.resources} />
              <span className="resource-picker-pair__arrow">→</span>
              <ResourcePicker label="要求する" values={proposeRequest} onChange={setProposeRequest} />
            </div>
            <label className="trade-panel__target">
              相手:
              <select value={targetPlayerId} onChange={(e) => setTargetPlayerId(e.target.value)}>
                <option value="">全員へ提案</option>
                {clientState.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={handleProposeTrade}>提案する</button>
          </details>
        </>
      )}

      {myProposedTrades.length > 0 && (
        <div className="trade-panel__list">
          <h3>自分の提案</h3>
          {myProposedTrades.map((t) => (
            <div key={t.id} className="trade-offer">
              <div className="trade-offer__row">
                <span>{describeTrade(t)}</span>
                <button onClick={() => handleCancel(t.id)}>取り消す</button>
              </div>
              {t.acceptedBy.length > 0 && (
                <div className="trade-offer__accepters">
                  {t.acceptedBy.map((accepterId) => {
                    const accepter = clientState.players.find((p) => p.id === accepterId)
                    // The actual pick happens in the big FinalizeTradeModal popup, not here.
                    return <span key={accepterId}>{accepter?.name ?? '相手'}さんが承諾済み</span>
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {incomingTrades.length > 0 && (
        <div className="trade-panel__list">
          <h3>受信した提案</h3>
          {incomingTrades.map((t) => {
            const alreadyAccepted = t.acceptedBy.includes(playerId)
            return (
              <div key={t.id} className="trade-offer">
                <div className="trade-offer__row">
                  <span>{describeTrade(t)}</span>
                  {alreadyAccepted ? (
                    <span className="trade-offer__waiting">承諾済み・提案者の決定待ち</span>
                  ) : (
                    <>
                      <button disabled={!canAfford(me.resources, t.request)} onClick={() => handleRespond(t.id, true)}>
                        承諾
                      </button>
                      <button onClick={() => handleRespond(t.id, false)}>拒否</button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
