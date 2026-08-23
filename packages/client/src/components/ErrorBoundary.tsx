import { Component, type ReactNode } from 'react'

interface ErrorBoundaryState {
  error: Error | null
}

/** Catches unexpected render-time crashes (e.g. a browser extension or auto-translate mutating
 * the DOM out from under React) and shows a recoverable message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page">
          <h1>問題が発生しました</h1>
          <p>予期しないエラーが起きました。ページを再読み込みしてください。</p>
          <p className="error-text">{this.state.error.message}</p>
          <button onClick={() => window.location.reload()}>再読み込み</button>
        </div>
      )
    }
    return this.props.children
  }
}
