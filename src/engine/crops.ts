export type CropId = 'soja' | 'milho'

export interface CropConfig {
  id: CropId
  label: string
  bushelsPerSack: number
  color: string
}

export const CROPS: Record<CropId, CropConfig> = {
  soja: { id: 'soja', label: 'Soja', bushelsPerSack: 2.20462, color: '#12634A' },
  milho: { id: 'milho', label: 'Milho', bushelsPerSack: 2.36218, color: '#D1AE6C' },
}
