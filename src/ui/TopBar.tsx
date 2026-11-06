import { Moon, Sun } from 'lucide-react'
import { useStore } from '../state/StoreProvider'
import { CROPS } from '../engine/crops'
import { OUTRO_FOB_ID, findFob } from '../data/fobPoints'
import { Segmented } from './Segmented'
import type { Route } from './routes'
import { useTheme } from './theme'

const TITLES: Record<Exclude<Route, 'inicio'>, string> = {
  simulador: 'Lavoura e custos',
  comercializacao: 'Comercialização',
  resultados: 'Resultados financeiros',
  preco: 'De onde vem o preço',
}

/**
 * Colour-theme switch, next to the logo: a small gold pill with the icon of the theme it switches TO (sun in the dark
 * theme, moon in the light one). A plain button whose accessible name says what a click does, so no pressed/checked state
 * is needed. Disabled on the Início, which is always dark (the choice is kept for the other pages).
 */
export function ThemeToggle({ disabled }: { disabled: boolean }) {
  const { theme, toggle } = useTheme()
  const toLight = theme === 'escuro'
  const label = toLight ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'
  const Icon = toLight ? Sun : Moon
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-label={label}
      title={disabled ? 'O Início é sempre escuro' : label}
      data-testid="theme-toggle"
      className="inline-flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-g7 bg-g7/10 px-2 text-[11px] font-semibold text-g7 transition-colors duration-200 hover:bg-g7/20 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[28px] md:min-w-[28px] md:px-2.5"
    >
      <Icon aria-hidden="true" size={14} strokeWidth={1.75} />
      <span className="hidden lg:inline">{toLight ? 'Tema claro' : 'Tema escuro'}</span>
    </button>
  )
}

/** The two app-wide selectors, compact, for the right end of the top bar: the crop and the currency. */
export function CropCurrencyControls() {
  const { state, dispatch } = useStore()
  return (
    <div data-testid="shell-controls" className="flex shrink-0 items-center gap-1.5">
      <Segmented
        size="sm"
        ariaLabel="Cultura"
        value={state.crop}
        options={[
          { value: 'soja', label: 'Soja' },
          { value: 'milho', label: 'Milho' },
        ]}
        onChange={(crop) => dispatch({ type: 'setCrop', crop })}
      />
      <Segmented
        size="sm"
        ariaLabel="Moeda"
        value={state.currency}
        options={[
          { value: 'BRL', label: 'R$' },
          { value: 'USD', label: 'US$' },
        ]}
        onChange={(currency) => dispatch({ type: 'setCurrency', currency })}
      />
    </div>
  )
}

/** Slim sub-header under the NavBar: the page h1 with crop and ponto FOB (Lavoura e custos, Comercialização, Resultados financeiros). */
export function PageTitle({ route }: { route: Exclude<Route, 'inicio'> }) {
  const { state } = useStore()
  const place = state.fobId === OUTRO_FOB_ID ? 'outra praça (dados digitados)' : findFob(state.fobId)?.label
  return (
    <div className="border-b border-line bg-card px-4 py-2 md:px-[18px]">
      <h1 className="mx-auto min-w-0 max-w-[1280px] truncate text-[16px] font-bold">
        {TITLES[route]}
        <span className="font-normal text-mut">
          {' '}
          · {CROPS[state.crop].label}
          {place ? ` · ${place}` : ''}
        </span>
      </h1>
    </div>
  )
}
