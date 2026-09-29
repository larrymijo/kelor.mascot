'use client'

import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** What to show instead once something below has failed; nothing by default. */
  fallback?: ReactNode
  onError?: (error: unknown) => void
}

/**
 * Catches a render or loading error below it, such as a chunk or a model
 * that failed to download, so it never reaches the root and replaces the
 * whole page with Next's error screen. React still needs a class for this.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
