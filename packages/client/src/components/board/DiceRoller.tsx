import { useEffect, useState } from 'react'
import { useGameStore } from '../../hooks/useGameStore'

const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] // Unicode pips for 1-6

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
        <span className="die-face">{DIE_FACES[displayDice[0] - 1]}</span>
        <span className="die-face">{DIE_FACES[displayDice[1] - 1]}</span>
      </div>
      {!isRolling && (
        <span className="dice-roller__total">
          {displayDice[0]} + {displayDice[1]} = {displayDice[0] + displayDice[1]}
        </span>
      )}
    </div>
  )
}
