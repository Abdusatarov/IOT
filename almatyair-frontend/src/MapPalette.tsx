import {SlidersHorizontal} from 'lucide-react'
import {palettes} from './mapPaletteState'
import type {Preset,useMapPalette} from './mapPaletteState'
import {formatValue} from './time'

export default function MapPalette({palette,min,max}:{palette:ReturnType<typeof useMapPalette>;min:number;max:number}){
 const {choice,save,colors}=palette
 return <fieldset className="map-palette-picker"><legend>Палитра</legend><div className="map-palette-choices">{Object.entries(palettes).map(([key,preset])=><button key={key} type="button" className="map-palette-choice" aria-label={`Палитра: ${preset.label}`} title={preset.label} aria-pressed={choice.preset===key} onClick={()=>save({...choice,preset:key as Preset})}><span className="map-palette-circle" aria-hidden="true">{preset.colors.map(color=><span key={color} style={{backgroundColor:color}}/>)}</span></button>)}<button type="button" className="map-palette-choice" aria-label="Своя палитра" title="Своя палитра" aria-pressed={choice.preset==='custom'} onClick={()=>save({...choice,preset:'custom'})}><SlidersHorizontal size={20} strokeWidth={1.5} aria-hidden="true"/></button></div><p className="map-setting-caption">{choice.preset==='custom'?'Своя палитра':palettes[choice.preset].label}</p>
 {choice.preset==='custom'&&<div className="map-custom-colors">{choice.custom.map((color,index)=><label key={index}><span>Цвет {index+1}</span><input type="color" aria-label={`Цвет уровня ${index+1}`} value={color} onChange={event=>save({preset:'custom',custom:choice.custom.map((old,i)=>i===index?event.target.value:old)})}/></label>)}</div>}
 <div className="map-settings-scale" aria-label="Выбранная цветовая шкала">{colors.map((color,index)=><span key={index} style={{backgroundColor:color}}/>)}</div><div className="map-settings-range"><span>{formatValue(min)} raw</span><span>{formatValue(max)} raw</span></div><p className="map-setting-caption">От меньшего сигнала к большему. Цвета не обозначают пороги безопасности.</p></fieldset>
}
