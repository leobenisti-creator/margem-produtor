import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Called by the "Recarregar" button; defaults to reloading the page. */
  onReload?: () => void
}

interface State {
  failed: boolean
}

/** Last line of defence around the routed page: a render error shows a short message, not a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erro ao renderizar a página', error, info.componentStack)
  }

  private reload = () => {
    if (this.props.onReload) this.props.onReload()
    else window.location.reload()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="my-8 grid gap-3 rounded-xl border border-line bg-card p-5 text-tx">
        <p>Algo deu errado ao carregar esta página. Recarregue para tentar de novo.</p>
        <button
          type="button"
          onClick={this.reload}
          className="min-h-[44px] justify-self-start rounded-full bg-acc px-4 font-bold text-accink"
        >
          Recarregar
        </button>
      </div>
    )
  }
}
