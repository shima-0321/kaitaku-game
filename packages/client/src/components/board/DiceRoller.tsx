import { useEffect, useState } from 'react'
import { useGameStore } from '../../hooks/useGameStore'

// Which of a 3x3 grid's 9 cells (row-major, 0-8) hold a pip, per face value.
const PIP_LAYOUTS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function Die({ value }: { value: number }) {
  const lit = new Set(PIP_LAYOUTS[value] ?? [])
  return (
    <div className="die">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={lit.has(i) ? 'die__pip' : 'die__pip die__pip--off'} />
      ))}
    </div>
  )
}

const ROLL_DURATION_MS = 700
const ROLL_TICK_MS = 80

function randomFace(): number {
  return 1 + Math.floor(Math.random() * 6)
}

/** Shows the two dice: shuffles random faces while a roll is in flight, then settles on the real
 * result once the server's `dice_rolled` event resolves. Purely cosmetic -- the authoritative
 * total still comes from `clientState.turn.lastDiceRoll` via state_update. */
export function DiceRoller() {
  const diceRollEvent = useGameStore((s) => s.diceRollEvent)
  const lastDiceRoll = useGameStore((s) => s.clientState?.turn?.lastDiceRoll ?? null)
  const [displayDice, setDisplayDice] = useState<[number, number] | null>(lastDiceRoll)
  const [isRolling, setIsRolling] = useState(false)

  useEffect(() => {
    if (!diceRollEvent) return
    setIsRolling(true)

    const tickId = window.setInterval(() => {
      setDisplayDice([randomFace(), randomFace()])
    }, ROLL_TICK_MS)

    const stopId = window.setTimeout(() => {
      clearInterval(tickId)
      setDisplayDice(diceRollEvent.dice)
      setIsRolling(false)
    }, ROLL_DURATION_MS)

    return () => {
      clearInterval(tickId)
      clearTimeout(stopId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diceRollEvent])

  if (!displayDice) return null

  return (
    <div className="dice-roller">
      <div className={`dice-roller__dice ${isRolling ? 'rolling' : ''}`}>
        <Die value={displayDice[0]} />
        <Die value={displayDice[1]} />
      </div>
      {!isRolling && (
        <span className="dice-roller__total">
          {displayDice[0]} + {displayDice[1]} = {displayDice[0] + displayDice[1]}
        </span>
      )}
    </div>
  )
}
