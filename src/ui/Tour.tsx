import { useCallback, useState } from 'react'
import { useStore } from '../state/StoreProvider'
import { Balloons } from './tour/Balloons'
import { Welcome } from './tour/Welcome'
import { WELCOME_CARDS } from './tour/steps'

type Phase = 'welcome' | 'balloons'

/**
 * Where the visitor stopped, kept for this page session only. Leaving Lavoura e custos mid-tour unmounts the Tour
 * without marking it done; coming back resumes here. A reload starts over (nothing but `tourSeen` is persisted).
 */
let progress: { phase: Phase; n: number } = { phase: 'welcome', n: 0 }

/** Test hook: forget the remembered position. */
export function resetTourProgress() {
  progress = { phase: 'welcome', n: 0 }
}

/**
 * First-visit tour of Lavoura e custos (mounted by AppShell on that page only): welcome cards, then balloons on the
 * real fields. Finishing or skipping (button or Esc) dispatches `tourDone`, so it never shows again.
 */
export function Tour() {
  const { state, dispatch } = useStore()
  const [phase, setPhase] = useState<Phase>(progress.phase)
  const [card, setCard] = useState(phase === 'welcome' ? progress.n : 0)
  const finish = useCallback(() => {
    resetTourProgress()
    dispatch({ type: 'tourDone' })
  }, [dispatch])
  const onIndex = useCallback((i: number) => {
    progress = { phase: 'balloons', n: i }
  }, [])

  if (state.tourSeen) return null
  if (phase === 'welcome') {
    return (
      <Welcome
        card={Math.min(card, WELCOME_CARDS.length - 1)}
        onCard={(n) => {
          progress = { phase: 'welcome', n }
          setCard(n)
        }}
        onSkip={finish}
        onDone={() => {
          progress = { phase: 'balloons', n: 0 }
          setPhase('balloons')
        }}
      />
    )
  }
  return <Balloons startIndex={progress.phase === 'balloons' ? progress.n : 0} onIndex={onIndex} onFinish={finish} />
}
