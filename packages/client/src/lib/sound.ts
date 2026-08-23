import buttonClickSound from '../assets/sounds/決定ボタンを押す7.mp3'
import bgmSound from '../assets/sounds/In_the_jungle.mp3'
import diceRollSound from '../assets/sounds/鉛筆が転がる.mp3'
import buildSound from '../assets/sounds/木材に釘を打つ.mp3'
import myTurnStartSound from '../assets/sounds/決定ボタンを押す4.mp3'
import knightSound from '../assets/sounds/剣を抜く.mp3'
import levelUpSound from '../assets/sounds/レベルアップ.mp3'

export const SOUND_URLS = {
  buttonClick: buttonClickSound,
  diceRoll: diceRollSound,
  build: buildSound,
  myTurnStart: myTurnStartSound,
  knight: knightSound,
  levelUp: levelUpSound,
}

const BASE_SFX_VOLUME = 0.6
const BASE_BGM_VOLUME = 0.08
const BASE_GAME_SFX_VOLUME = 0.45
export const MAX_VOLUME_PERCENT = 10
const DEFAULT_VOLUME_PERCENT = 10

const BGM_VOLUME_STORAGE_KEY = 'kaitaku_bgm_volume_percent'
const SFX_VOLUME_STORAGE_KEY = 'kaitaku_sfx_volume_percent'
const MUTE_STORAGE_KEY = 'kaitaku_muted'

function readStoredPercent(key: string): number {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw === null ? DEFAULT_VOLUME_PERCENT : Number(raw)
    return Number.isFinite(parsed) ? Math.min(MAX_VOLUME_PERCENT, Math.max(0, parsed)) : DEFAULT_VOLUME_PERCENT
  } catch {
    return DEFAULT_VOLUME_PERCENT
  }
}

function readStoredMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let bgmVolumePercent = readStoredPercent(BGM_VOLUME_STORAGE_KEY)
let sfxVolumePercent = readStoredPercent(SFX_VOLUME_STORAGE_KEY)
let muted = readStoredMuted()
const listeners = new Set<() => void>()

export interface VolumeState {
  bgmVolumePercent: number
  sfxVolumePercent: number
  muted: boolean
}

export function getVolumeState(): VolumeState {
  return { bgmVolumePercent, sfxVolumePercent, muted }
}

export function subscribeVolume(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notifyVolumeChange() {
  for (const listener of listeners) listener()
}

function bgmScale(): number {
  return muted ? 0 : bgmVolumePercent / 100
}

function sfxScale(): number {
  return muted ? 0 : sfxVolumePercent / 100
}

export function setBgmVolumePercent(percent: number) {
  bgmVolumePercent = Math.min(MAX_VOLUME_PERCENT, Math.max(0, Math.round(percent)))
  try {
    localStorage.setItem(BGM_VOLUME_STORAGE_KEY, String(bgmVolumePercent))
  } catch {
    // ignore storage failures (private mode, disabled storage, etc.)
  }
  applyBgmVolume()
  notifyVolumeChange()
}

export function setSfxVolumePercent(percent: number) {
  sfxVolumePercent = Math.min(MAX_VOLUME_PERCENT, Math.max(0, Math.round(percent)))
  try {
    localStorage.setItem(SFX_VOLUME_STORAGE_KEY, String(sfxVolumePercent))
  } catch {
    // ignore storage failures
  }
  notifyVolumeChange()
}

export function toggleMute() {
  muted = !muted
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0')
  } catch {
    // ignore storage failures
  }
  applyBgmVolume()
  notifyVolumeChange()
}

const audioCache = new Map<string, HTMLAudioElement>()

function playAt(src: string, baseVolume: number) {
  if (muted || sfxVolumePercent === 0) return
  let audio = audioCache.get(src)
  if (!audio) {
    audio = new Audio(src)
    audioCache.set(src, audio)
  }
  audio.volume = baseVolume * sfxScale()
  audio.currentTime = 0
  void audio.play().catch(() => {})
}

export function playSound(src: string) {
  playAt(src, BASE_SFX_VOLUME)
}

/** Game-event sound effects (dice roll, build, turn start, knight...) -- louder than the BGM bed so they stand out over it. */
export function playGameSound(src: string) {
  playAt(src, BASE_GAME_SFX_VOLUME)
}

let bgmAudio: HTMLAudioElement | null = null
let bgmWantsToPlay = false

function applyBgmVolume() {
  if (bgmAudio) bgmAudio.volume = BASE_BGM_VOLUME * bgmScale()
}

export function startBgm() {
  bgmWantsToPlay = true
  if (!bgmAudio) {
    bgmAudio = new Audio(bgmSound)
    bgmAudio.loop = true
  }
  applyBgmVolume()
  void bgmAudio.play().catch(() => {})
}

export function stopBgm() {
  bgmWantsToPlay = false
  bgmAudio?.pause()
  if (bgmAudio) bgmAudio.currentTime = 0
}

/** The browser's autoplay policy can silently reject the BGM's play() when it starts without a
 * direct user gesture (e.g. entering GamePage because another player started the game). Call this
 * from any click handler so playback picks back up on the player's next interaction. */
export function resumeBgmIfNeeded() {
  if (bgmWantsToPlay && bgmAudio?.paused) {
    void bgmAudio.play().catch(() => {})
  }
}
