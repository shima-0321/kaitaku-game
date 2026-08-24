import { useEffect } from 'react'
import type { DiceRolledPayload, GameOverPayload, GameSoundPayload, RobbedDetailPayload } from '@catan-online/shared'
import { socket } from '../lib/socket'
import { useGameStore } from './useGameStore'
import { playGameSound, SOUND_URLS } from '../lib/sound'

const GAME_SOUND_BY_KIND = {
  BUILD: SOUND_URLS.build,
  LEVEL_UP: SOUND_URLS.levelUp,
}

/** Wires the socket.io client's lifecycle + core broadcast events into the Zustand store. Mount once near the app root. */
export function useSocketConnection() {
  const setConnected = useGameStore((s) => s.setConnected)
  const setRoomInfo = useGameStore((s) => s.setRoomInfo)
  const setClientState = useGameStore((s) => s.setClientState)
  const setGameOverPayload = useGameStore((s) => s.setGameOverPayload)
  const setDiceRollEvent = useGameStore((s) => s.setDiceRollEvent)
  const setRobbedDetailEvent = useGameStore((s) => s.setRobbedDetailEvent)

  useEffect(() => {
    function onConnect() {
      setConnected(true)
    }
    function onDisconnect() {
      setConnected(false)
    }
    function onDiceRolled(payload: DiceRolledPayload) {
      // Play the roll sound here (once per server event) instead of in DiceRoller -- that
      // component mounts/unmounts as pendingRobber toggles the action-bar's visibility, and an
      // effect keyed on diceRollEvent would replay the sound on every remount after a 7.
      setDiceRollEvent(payload)
      playGameSound(SOUND_URLS.diceRoll)
    }
    function onKnightPlayed() {
      // Broadcast to every player (not just the one who played the card) so everyone hears it.
      playGameSound(SOUND_URLS.knight)
    }
    function onGameSound(payload: GameSoundPayload) {
      playGameSound(GAME_SOUND_BY_KIND[payload.kind])
    }
    function onGameOver(payload: GameOverPayload) {
      // Broadcast to every player, not just the winner, so the whole table hears it.
      setGameOverPayload(payload)
      playGameSound(SOUND_URLS.win)
    }
    function onRobbedDetail(payload: RobbedDetailPayload) {
      setRobbedDetailEvent(payload)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room_updated', setRoomInfo)
    socket.on('game_started', setClientState)
    socket.on('state_update', setClientState)
    socket.on('game_over', onGameOver)
    socket.on('dice_rolled', onDiceRolled)
    socket.on('knight_played', onKnightPlayed)
    socket.on('game_sound', onGameSound)
    socket.on('robbed_detail', onRobbedDetail)

    if (!socket.connected) socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room_updated', setRoomInfo)
      socket.off('game_started', setClientState)
      socket.off('state_update', setClientState)
      socket.off('game_over', onGameOver)
      socket.off('dice_rolled', onDiceRolled)
      socket.off('knight_played', onKnightPlayed)
      socket.off('game_sound', onGameSound)
      socket.off('robbed_detail', onRobbedDetail)
    }
  }, [setConnected, setRoomInfo, setClientState, setGameOverPayload, setDiceRollEvent, setRobbedDetailEvent])
}
