import {useState} from 'react'
import {rawColors} from './live'

export const palettes = {
  brown: {label: 'Коричневая', colors: rawColors},
  ocean: {label: 'Океан', colors: ['#e1f7f3','#a8e3dc','#64c8ca','#349bb9','#245f99','#142c65']},
  violet: {label: 'Фиолетовая', colors: ['#f3e7fc','#ddc0f0','#b993df','#905dbe','#653894','#391c63']},
  sunset: {label: 'Закат', colors: ['#fff0b6','#fbd377','#ffa14d','#f36c40','#ca393a','#891c40']},
}
export type Preset = keyof typeof palettes
type Choice = {preset: Preset | 'custom'; custom: string[]}
const storageKey = 'almatyair.mapPalette'

function readChoice(): Choice {
  const fallback: Choice = {preset: 'brown', custom: [...rawColors]}
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as Choice | null
    if (saved && (saved.preset === 'custom' || Object.hasOwn(palettes, saved.preset))
      && Array.isArray(saved.custom) && saved.custom.length === rawColors.length
      && saved.custom.every(color => /^#[0-9a-f]{6}$/i.test(color))) return saved
  } catch { /* Storage can be unavailable or contain an obsolete setting. */ }
  return fallback
}

export function useMapPalette() {
  const [choice, setChoice] = useState(readChoice)
  function save(next: Choice) {
    setChoice(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Keep the in-session choice. */ }
  }
  const colors = choice.preset === 'custom' ? choice.custom : palettes[choice.preset].colors
  return {choice, save, colors}
}
