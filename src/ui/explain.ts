import { inputsAtPrice, type ExplainStep, type FarmInputs, type Result, type Scenario } from '../engine/calc'
import type { CropConfig } from '../engine/crops'
import { effectiveYieldScHa, normalizeBarter } from '../engine/production'
import { brlToUsd } from '../engine/units'
import { fmtMoney, fmtNum, fmtPct, fmtUsd } from './format'
import { fmtLoose, fmtMarginPct } from './fmtExtra'

export type ExplainKey =
  'margem' | 'precoFazenda' | 'custo' | 'margemTotal' | 'precoMinimo' | 'blendada'

export interface ExplainContext {
  result: Result
  farmInputs: FarmInputs
  scenario: Scenario
  crop: CropConfig
  currency: 'BRL' | 'USD'
  fx: number
  marginBase: 'receita' | 'custo'
  /** Optional: when 'categorias', the cost explanation mentions the eight categories. */
  costMode?: 'total' | 'categorias'
  /** Where B3/Cepea sit today relative to the farm price (see ui/comparison.ts). */
  comparison?: 'acima' | 'abaixo' | 'proximo'
}

export interface ExplainLine {
  label: string
  formula: string
  value: string
}

export interface Explanation {
  title: string
  intro: string
  lines: ExplainLine[]
  note?: string
}

export const EXPLAIN_TITLES: Record<ExplainKey, string> = {
  margem: 'Margem por saca',
  precoFazenda: 'Preço na fazenda',
  custo: 'Custo por saca',
  margemTotal: 'Margem total da safra',
  precoMinimo: 'Preço mínimo para a meta',
  blendada: 'Margem blendada',
}

const DASH = '—'

/**
 * One engine step in its own unit. Money (R$/sc, R$/ha) follows the display currency; a dollar
 * rate (R$/US$) is always printed as "R$ x,xxxx/US$" and never converted.
 */
export function fmtStepValue(step: ExplainStep, currency: 'BRL' | 'USD', fx: number): string {
  const v = step.value
  if (v === null || !Number.isFinite(v)) return DASH
  const money = (brl: number) => fmtMoney(currency === 'USD' && fx > 0 ? brlToUsd(brl, fx) : brl, currency)
  switch (step.unit) {
    case 'R$/US$':
      return `R$ ${fmtNum(v, 4)}/US$`
    case 'US$/bu':
      return `${fmtUsd(v)} /bushel`
    case '%':
      return fmtPct(v, 1)
    case 'R$/ha':
      return `${money(v)} /ha`
    case 'R$/sc':
      return `${money(v)} /sc`
  }
}

function stepValue(r: Result, label: string, fallback: number | null): number | null {
  const s = r.steps.find((x) => x.label === label)
  return s ? s.value : fallback
}

export function buildExplanation(key: ExplainKey, ctx: ExplainContext): Explanation {
  const { result: r, farmInputs: f, scenario: s, crop, currency, fx } = ctx
  const money = (brl: number | null): string => {
    if (brl === null || !Number.isFinite(brl)) return DASH
    return fmtMoney(currency === 'USD' && fx > 0 ? brlToUsd(brl, fx) : brl, currency)
  }
  const perSc = (brl: number | null) => (money(brl) === DASH ? DASH : `${money(brl)} /sc`)
  // Net sacks per hectare: the productivity less the barter sacks spread over the area (= yieldScHa without barter).
  const netYield = effectiveYieldScHa(f)
  const barter = normalizeBarter(f.barterSc) > 0
  const hasYield = netYield > 0
  const title = EXPLAIN_TITLES[key]

  switch (key) {
    case 'precoFazenda': {
      const bu = stepValue(r, 'Prêmio + CBOT', (s.cbotUsc + s.basisUsc) / 100)
      const reference = stepValue(r, 'Preço de referência', r.referencePriceBrl)
      const farm = stepValue(r, 'Preço na fazenda', r.farmPriceBrl)
      // With part of the open sale at a locked dollar the engine adds an "effective dollar" step.
      const eff = r.steps.find((x) => x.unit === 'R$/US$')
      const fxShown = eff ? `dólar efetivo ${fmtNum(eff.value, 4)}` : `dólar ${fmtNum(s.fx, 4)}`
      const effLine = eff
        ? [
            {
              label: 'Dólar efetivo da venda',
              formula: `(1 − ${fmtPct(f.fxLockPct, 0)}) × dólar ${fmtNum(s.fx, 4)} + ${fmtPct(f.fxLockPct, 0)} × dólar travado ${fmtNum(f.fxLockRate, 4)}`,
              value: fmtStepValue(eff, currency, fx),
            },
          ]
        : []
      return {
        title,
        intro:
          'É quanto a saca vale na porteira da sua fazenda hoje, partindo do preço de exportação (paridade de exportação) e descontando o que custa levar o grão até o porto.',
        lines: [
          {
            label: 'Bolsa (CBOT)',
            formula: `CBOT ${fmtNum(s.cbotUsc, 2)} US¢/bu ÷ 100`,
            value: Number.isFinite(s.cbotUsc) ? `${fmtUsd(s.cbotUsc / 100)} /bushel` : DASH,
          },
          {
            label: '+ Prêmio do porto',
            formula: `prêmio ${fmtNum(s.basisUsc, 2)} US¢/bu ÷ 100 (prêmio ou desconto sobre a bolsa)`,
            value: Number.isFinite(s.basisUsc) ? `${fmtUsd(s.basisUsc / 100)} /bushel` : DASH,
          },
          {
            label: 'Preço de referência',
            formula: `(bolsa + prêmio) ${bu === null ? DASH : fmtUsd(bu)} × ${fmtNum(crop.bushelsPerSack, 5)} bushels por saca × ${fxShown}`,
            value: perSc(reference),
          },
          ...effLine,
          {
            label: 'Menos frete',
            formula: 'frete até o porto',
            value: perSc(f.freightBrlPerSc),
          },
          {
            label: 'Menos taxas de porto e armazém',
            formula: 'taxas por saca',
            value: perSc(f.portFeesBrlPerSc),
          },
          {
            label: 'Preço na fazenda',
            formula: 'referência − frete − taxas',
            value: perSc(farm),
          },
        ],
        note:
          `Cálculo para ${crop.label.toLowerCase()}. CBOT em US¢ por bushel; o prêmio do porto é o prêmio ou desconto sobre a bolsa.` +
          ' Comparação: B3 e Cepea são preços em outra praça (bolsa/porto), sem o frete e as taxas da sua fazenda; por isso ' +
          (ctx.comparison === 'acima'
            ? 'costumam ficar acima do preço na fazenda.'
            : ctx.comparison === 'abaixo'
              ? 'hoje ficam abaixo do preço na fazenda.'
              : ctx.comparison === 'proximo'
                ? 'hoje ficam próximos do preço na fazenda.'
                : 'podem ficar acima ou abaixo do preço na fazenda.'),
      }
    }

    case 'custo': {
      const categorias = ctx.costMode === 'categorias'
      const whole = inputsAtPrice(f, s.fx, r.farmPriceBrl ?? Number.NaN).costPerHaBrl
      return {
        title,
        intro:
          'É o quanto você gasta para produzir cada saca: o custo de um hectare dividido pelo que ele produz.',
        lines: [
          {
            label: 'Custo por hectare',
            formula:
              (categorias ? 'soma das 8 categorias de custo' : 'valor informado') +
              (f.costUsd.length > 0 || f.costScHa > 0 ? ' (custos em US$ e arrendamento em sacas pelo dólar e preço de hoje)' : ''),
            value: money(whole) === DASH ? DASH : `${money(whole)} /ha`,
          },
          {
            label: barter ? 'Produtividade (sem as sacas do barter)' : 'Produtividade',
            formula: barter ? 'produtividade − barter ÷ área' : 'sacas por hectare',
            value: hasYield ? `${fmtLoose(netYield)} sc/ha` : DASH,
          },
          {
            label: 'Custo por saca',
            formula: 'custo por hectare ÷ produtividade',
            value: perSc(r.costPerSc),
          },
        ],
        note: hasYield ? undefined : 'Informe a produtividade para calcular o custo por saca.',
      }
    }

    case 'margem': {
      const overRevenue =
        r.marginPerSc !== null && r.farmPriceBrl !== null && r.farmPriceBrl > 0 ? r.marginPerSc / r.farmPriceBrl : null
      const overCost =
        r.marginPerSc !== null && r.costPerSc !== null && r.costPerSc > 0
          ? r.marginPerSc / r.costPerSc
          : null
      const active = ' (a usada na tela)'
      return {
        title,
        intro:
          'É o que sobra em cada saca depois de pagar o custo de produzi-la, vendendo ao preço na fazenda de hoje.',
        lines: [
          {
            label: 'Preço na fazenda',
            formula: 'preço de hoje',
            value: perSc(r.farmPriceBrl),
          },
          {
            label: 'Menos custo por saca',
            formula: 'custo por hectare ÷ produtividade',
            value: perSc(r.costPerSc),
          },
          {
            label: 'Margem por saca',
            formula: 'preço na fazenda − custo por saca',
            value: perSc(r.marginPerSc),
          },
          {
            label: `Margem sobre a receita${ctx.marginBase === 'receita' ? active : ''}`,
            formula: 'margem ÷ preço na fazenda',
            value: fmtMarginPct(overRevenue),
          },
          {
            label: `Margem sobre o custo${ctx.marginBase === 'custo' ? active : ''}`,
            formula: 'margem ÷ custo por saca',
            value: fmtMarginPct(overCost),
          },
        ],
        note: 'Você pode trocar entre margem sobre a receita e sobre o custo na pílula ao lado da margem.',
      }
    }

    case 'margemTotal':
      return {
        title,
        intro: 'É a margem de uma saca multiplicada por tudo o que a lavoura produz.',
        lines: [
          {
            label: 'Margem por saca',
            formula: 'preço na fazenda − custo por saca',
            value: perSc(r.marginPerSc),
          },
          {
            label: 'Margem por hectare',
            formula: `margem por saca × ${hasYield ? fmtLoose(netYield) : DASH} sc/ha`,
            value: money(r.marginPerHa) === DASH ? DASH : `${money(r.marginPerHa)} /ha`,
          },
          {
            label: 'Margem total da safra',
            formula: `margem por hectare × ${f.areaHa > 0 ? fmtLoose(f.areaHa) : DASH} ha`,
            value: money(r.marginTotal),
          },
        ],
        note:
          f.areaHa > 0 && hasYield ? undefined : 'Informe área e produtividade para ver o total.',
      }

    case 'precoMinimo': {
      if (f.targetMargin === null) {
        return {
          title,
          intro: 'Você não definiu uma meta de margem, então não há preço mínimo para calcular.',
          lines: [{ label: 'Meta de margem', formula: 'não definida', value: DASH }],
          note: 'Defina a meta no botão “Definir meta de margem”, logo abaixo dos resultados da Simulação, para ver o preço mínimo.',
        }
      }
      const receita = ctx.marginBase === 'receita'
      const target = fmtPct(f.targetMargin, 0)
      const unreachable = r.minPriceBrl === null && hasYield
      const formula = receita
        ? `custo por saca ÷ (1 − ${target})`
        : `custo por saca × (1 + ${target})`
      return {
        title,
        intro: `É o menor preço de venda que ainda entrega a margem que você quer (${target} ${receita ? 'sobre a receita' : 'sobre o custo'}).`,
        lines: [
          {
            label: 'Custo por saca',
            formula: 'custo por hectare ÷ produtividade',
            value: perSc(r.costPerSc),
          },
          {
            label: 'Meta de margem',
            formula: receita ? 'sobre a receita' : 'sobre o custo',
            value: target,
          },
          {
            label: 'Preço mínimo',
            formula,
            value: unreachable ? 'inatingível' : perSc(r.minPriceBrl),
          },
        ],
        note: unreachable
          ? 'Com meta de 100% ou mais sobre a receita, nenhum preço entrega essa margem: por isso aparece “inatingível”.'
          : hasYield
            ? undefined
            : 'Informe a produtividade para calcular o preço mínimo.',
      }
    }

    case 'blendada': {
      const sold = Math.min(1, Math.max(0, f.soldPct))
      return {
        title,
        intro:
          'Mistura o que você já vendeu (a preço fixo) com o que ainda está em aberto (ao preço de hoje) e mostra a margem sobre esse preço médio.',
        lines: [
          {
            label: 'Parte vendida',
            formula: 'percentual já vendido',
            value: fmtPct(sold, 0),
          },
          {
            label: 'Preço médio vendido',
            formula: 'média dos contratos fechados',
            value: perSc(f.soldAvgPriceBrl),
          },
          {
            label: 'Preço de hoje',
            formula: 'preço na fazenda',
            value: perSc(r.farmPriceBrl),
          },
          {
            label: 'Preço blendado',
            formula: `${fmtPct(sold, 0)} × preço médio vendido + ${fmtPct(1 - sold, 0)} × preço de hoje`,
            value: perSc(r.blendedPriceBrl),
          },
          {
            label: 'Margem blendada',
            formula: `margem sobre esse preço (${ctx.marginBase === 'receita' ? 'sobre a receita' : 'sobre o custo'})`,
            value: fmtMarginPct(r.blendedMarginPct),
          },
        ],
        note:
          sold === 0 ? 'Nada vendido ainda: o preço blendado é igual ao preço de hoje.' : undefined,
      }
    }
  }
}
