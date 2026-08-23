import { useEffect, useState } from 'react'
import { getVolumeState, setBgmVolumePercent, setSfxVolumePercent, toggleMute, subscribeVolume, MAX_VOLUME_PERCENT } from '../lib/sound'

export function VolumeControl() {
  const [state, setState] = useState(getVolumeState())
  const [expanded, setExpanded] = useState(false)

  useEffect(() => subscribeVolume(() => setState(getVolumeState())), [])

  const isSilent = state.muted || (state.bgmVolumePercent === 0 && state.sfxVolumePercent === 0)

  if (!expanded) {
    return (
      <button
        type="button"
        className="volume-control--collapsed"
        onClick={() => setExpanded(true)}
        aria-label="音量設定を開く"
      >
        {isSilent ? '\u{1F507}' : '\u{1F50A}'}
      </button>
    )
  }

  return (
    <div className="volume-control">
      <div className="volume-control__header">
        <span className="volume-control__title">{isSilent ? '\u{1F507}' : '\u{1F50A}'} 音量</span>
        <button type="button" className="volume-control__collapse-btn" onClick={() => setExpanded(false)} aria-label="音量設定を閉じる">
          ✕
        </button>
      </div>
      <div className="volume-control__sliders">
        <label className="volume-control__slider-row">
          <span>BGM</span>
          <input
            type="range"
            min={0}
            max={MAX_VOLUME_PERCENT}
            value={state.bgmVolumePercent}
            onChange={(e) => setBgmVolumePercent(Number(e.target.value))}
            className="volume-control__slider"
            aria-label="BGM音量"
          />
        </label>
        <label className="volume-control__slider-row">
          <span>SE</span>
          <input
            type="range"
            min={0}
            max={MAX_VOLUME_PERCENT}
            value={state.sfxVolumePercent}
            onChange={(e) => setSfxVolumePercent(Number(e.target.value))}
            className="volume-control__slider"
            aria-label="効果音音量"
          />
        </label>
      </div>
      <button
        type="button"
        className={`volume-control__mute-btn ${state.muted ? 'active' : ''}`}
        onClick={toggleMute}
        aria-pressed={state.muted}
      >
        {state.muted ? 'ミュート中' : 'ミュートする'}
      </button>
    </div>
  )
}
