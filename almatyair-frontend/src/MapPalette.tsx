import {palettes} from './mapPaletteState'
import type {Preset,useMapPalette} from './mapPaletteState'

export default function MapPalette({palette, min, max}: {
  palette: ReturnType<typeof useMapPalette>; min: number; max: number
}) {
  const {choice, save, colors} = palette
  return <details className="map-palette">
    <summary title="Нажмите, чтобы изменить цвета карты">
      <span className="palette-label">Палитра MQ-135 · {choice.preset === 'custom' ? 'Своя' : palettes[choice.preset].label} ▴</span>
      <span className="palette-swatches" aria-hidden="true">{colors.map((color, i) => <span key={i} style={{backgroundColor: color}} />)}</span>
      <span className="palette-range"><small>{min} raw</small><small>{max} raw</small></span>
    </summary>
    <div className="card palette-options">
      <strong>Цвета карты</strong>
      <div className="palette-presets">
        {Object.entries(palettes).map(([key, preset]) =>
          <button key={key} type="button" aria-pressed={choice.preset === key}
            onClick={() => save({...choice, preset: key as Preset})}>
            <span className="palette-swatches" aria-hidden="true">{preset.colors.map(color => <span key={color} style={{backgroundColor: color}} />)}</span>
            {preset.label}
          </button>)}
        <button type="button" aria-pressed={choice.preset === 'custom'}
          onClick={() => save({...choice, preset: 'custom'})}>Своя палитра</button>
      </div>
      {choice.preset === 'custom' && <div className="palette-custom">
        {choice.custom.map((color, index) => <label key={index}>
          <span>{index + 1}</span>
          <input type="color" aria-label={`Цвет уровня ${index + 1}`} value={color}
            onChange={event => save({preset: 'custom', custom: choice.custom.map((value, i) => i === index ? event.target.value : value)})} />
        </label>)}
        <small>От меньшего сигнала к большему</small>
      </div>}
    </div>
  </details>
}
