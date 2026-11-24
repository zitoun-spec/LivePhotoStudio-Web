export const phases = [
  'Reading video', 'Processing full video', 'Extracting key photo',
  'Writing Live Photo metadata', 'Validating generated files', 'Conversion finished',
] as const

export type Progress = { phase: number; seconds?: number }
