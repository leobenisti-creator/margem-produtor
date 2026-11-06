import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

/** Temporary "what if" values of the Comercialização page: never saved, never written to the store. */
export interface WhatIfValues {
  yieldScHa?: number
  freightBrlPerSc?: number
  portFeesBrlPerSc?: number
  /** Premium in US¢/bu. */
  premiumUsc?: number
}

interface WhatIfApi {
  values: WhatIfValues
  set: (patch: WhatIfValues) => void
  reset: () => void
  /** True when at least one value is being simulated. */
  active: boolean
}

const NONE: WhatIfApi = { values: {}, set: () => {}, reset: () => {}, active: false }
const Ctx = createContext<WhatIfApi>(NONE)

/** Wraps the Comercialização page: everything inside reads the simulated values through `useResult`. */
export function WhatIfProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<WhatIfValues>({})
  const api = useMemo<WhatIfApi>(
    () => ({
      values,
      set: (patch) => setValues((v) => ({ ...v, ...patch })),
      reset: () => setValues({}),
      active: Object.values(values).some((v) => v !== undefined),
    }),
    [values],
  )
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useWhatIf(): WhatIfApi {
  return useContext(Ctx)
}
