import type { MouseEvent } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useSocketConnection } from './hooks/useSocketConnection'
import { useGameStore } from './hooks/useGameStore'
import { TopPage } from './pages/TopPage'
import { RoomPage } from './pages/RoomPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { VolumeControl } from './components/VolumeControl'
import { playSound, resumeBgmIfNeeded, SOUND_URLS } from './lib/sound'
import './App.css'

function ConnectionBadge() {
  const connected = useGameStore((s) => s.connected)
  return <div className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>{connected ? '接続中' : '切断'}</div>
}

function handleGlobalClick(e: MouseEvent<HTMLDivElement>) {
  resumeBgmIfNeeded()
  const button = (e.target as HTMLElement).closest('button')
  if (button && !button.disabled) playSound(SOUND_URLS.buttonClick)
}

function App() {
  useSocketConnection()

  return (
    <ErrorBoundary>
      <div onClickCapture={handleGlobalClick}>
        <BrowserRouter>
          <ConnectionBadge />
          <VolumeControl />
          <Routes>
            <Route path="/" element={<TopPage />} />
            <Route path="/room/:roomCode" element={<RoomPage />} />
          </Routes>
        </BrowserRouter>
      </div>
    </ErrorBoundary>
  )
}

export default App
