import {useEffect,useRef,useState} from 'react'
import {ChevronDown,ChevronUp,History,Info,Settings2,X} from 'lucide-react'
import {MapCanvas} from './AirMap'
import {selectStations} from './mapData'
import type {Reading} from './live'
import type {useMapPalette} from './mapPaletteState'
import MapPalette from './MapPalette'
import SensorPanel from './SensorPanel'
import {useWindowReadings} from './scopedReadings'
import {Button,DeviceCombobox,EmptyState,ErrorState,Skeleton} from './components/UI'
import {chartTime,formatDateTime,formatValue} from './time'
import './map-page.css'

type Props={snapshot?:{end:number;cutoff:number};rows:Reading[];devices:string[];district:string;onDevice:(value:string)=>void;hour:number;onHour:(value:number)=>void;palette:ReturnType<typeof useMapPalette>;min:number;max:number;error:string;loading:boolean;onRetry:()=>void;onAnalyze:(id:string)=>void}
export default function MapPage({snapshot,rows,devices,district,onDevice,hour,onHour,palette,min,max,error,loading,onRetry,onAnalyze}:Props){
 const [heat,setHeat]=useState(false),[settings,setSettings]=useState(false),[selectedId,setSelectedId]=useState<string|null>(()=>district==='Весь город'?null:district)
 const [historyOpen,setHistoryOpen]=useState(false),[legendOpen,setLegendOpen]=useState(true)
 const settingsRoot=useRef<HTMLDivElement>(null),settingsButton=useRef<HTMLButtonElement>(null),settingsClose=useRef<HTMLButtonElement>(null),historyControl=useRef<HTMLDivElement>(null)
 useEffect(()=>{
  if(!settings)return
  settingsClose.current?.focus({preventScroll:true})
  function outside(event:PointerEvent){if(!settingsRoot.current?.contains(event.target as Node))setSettings(false)}
  function key(event:KeyboardEvent){if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();setSettings(false);settingsButton.current?.focus({preventScroll:true})}}
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key)
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key)}
 },[settings])
 const {stations,cutoff,end}=snapshot?{stations:rows.filter(row=>district==='Весь город'||row.device_id===district),...snapshot}:selectStations(rows,hour,district)
 const visible=stations.filter(row=>row.latitude!==null&&row.longitude!==null)
 const selected=visible.find(row=>row.device_id===selectedId)
 const focus=selected??(district!=='Весь город'?visible.find(row=>row.device_id===district):undefined)
 function select(row:Reading){setSelectedId(row.device_id);setSettings(false)}
 function changeDevice(id:string){onDevice(id);setSelectedId(id==='Весь город'?null:id);setSettings(false)}
 function closeHistory(){setHistoryOpen(false);requestAnimationFrame(()=>historyControl.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true}))}
 const panelOpen=!!selected
 return <section className={`map-page ${panelOpen?'has-panel':''} ${historyOpen?'history-open':''} ${settings?'has-settings':''}`} aria-label="Карта датчиков">
  <MapCanvas stations={stations} palette={palette.colors} min={min} max={max} heat={heat} selected={selected?.device_id} onSelect={select} focus={focus} panelOpen={panelOpen}/>
  <div className="map-floating-controls"><DeviceCombobox devices={devices} value={district} onChange={changeDevice}/><label className="map-layer-toggle"><input type="checkbox" checked={heat} onChange={event=>setHeat(event.target.checked)}/><span>Слой</span></label><div className="map-settings-anchor" ref={settingsRoot}><button ref={settingsButton} type="button" className="ui-button ui-button--ghost ui-icon-button map-settings-toggle" aria-label="Настройки карты" aria-expanded={settings} aria-controls="map-palette-popover" onClick={()=>{setSettings(!settings);setSelectedId(null)}}><Settings2 size={20} strokeWidth={1.5}/></button>
   {settings&&<section id="map-palette-popover" className="map-settings-popover" role="dialog" aria-label="Настройки карты" aria-modal="false"><div className="map-popover-heading"><h2>Настройки карты</h2><button ref={settingsClose} type="button" className="ui-button ui-button--ghost ui-icon-button" aria-label="Закрыть настройки" onClick={()=>{setSettings(false);settingsButton.current?.focus({preventScroll:true})}}><X size={18} strokeWidth={1.5}/></button></div><MapPalette palette={palette} min={min} max={max}/><p className="map-setting-caption">Палитра сохраняется в этом браузере. Цветной слой — приблизительная оценка между датчиками; сигнал MQ-135 не откалиброван.</p></section>}
  </div></div>
  {heat&&<p className="map-estimate-note"><Info size={14} strokeWidth={1.5} aria-hidden="true"/>Приблизительная оценка между датчиками</p>}
  <div className="map-history-control" ref={historyControl}>{historyOpen?<div className="map-history-bar"><label htmlFor="map-time">24 ч назад</label><input id="map-time" className="map-time-slider" type="range" min="0" max="24" step="1" value={hour} disabled={!end} aria-label="История за последние 24 часа" aria-valuetext={end?`${formatDateTime(cutoff)}, время Алматы`:'Нет измерений'} onChange={event=>onHour(Number(event.target.value))}/><time dateTime={end?new Date(cutoff).toISOString():undefined} title={end?`${formatDateTime(cutoff)} · Алматы UTC+5`:'Нет измерений'} aria-label={end?`${formatDateTime(cutoff)}, время Алматы`:'Нет измерений'}>{end?chartTime(cutoff,true):'—'}</time><Button variant="ghost" className="ui-icon-button" aria-label="Свернуть историю" aria-expanded={true} onClick={closeHistory}><ChevronDown size={18} strokeWidth={1.5}/></Button></div>:<Button variant="ghost" className="map-history-toggle" aria-expanded={false} onClick={()=>setHistoryOpen(true)}><History size={18} strokeWidth={1.5}/>История</Button>}</div>
  <div className={`map-legend ${legendOpen?'is-open':''}`} aria-label="Шкала цветов MQ-135"><Button variant="ghost" className="map-legend-toggle" aria-label={legendOpen?'Свернуть шкалу':'Показать шкалу'} aria-expanded={legendOpen} onClick={()=>setLegendOpen(!legendOpen)}>{legendOpen?<><span>MQ-135 raw</span><span className="map-legend-scale"><span className="map-legend-colors">{palette.colors.map((color,i)=><span key={i} style={{backgroundColor:color}}/>)}</span><span className="map-legend-range"><span>{formatValue(min)}</span><span>{formatValue(max)}</span></span></span><ChevronDown size={14} strokeWidth={1.5}/></>:<><ChevronUp size={16} strokeWidth={1.5}/>Шкала</>}</Button></div>
  {loading&&!rows.length?<div className="map-state"><Skeleton style={{width:180,height:20}}/><p>Загрузка измерений…</p></div>:error&&!rows.length?<div className="map-state"><ErrorState onRetry={onRetry}/></div>:!visible.length?<div className="map-state"><EmptyState title="Нет точек на карте" description="На выбранный момент нет измерений с координатами."/></div>:null}
  {error&&rows.length>0&&<div className="map-refresh-warning" role="alert"><span>Не удалось обновить данные.</span><Button onClick={onRetry}>Повторить</Button></div>}
  {!settings&&selected&&<SensorHistory reading={selected} onClose={()=>setSelectedId(null)} onAnalyze={onAnalyze}/>}
 </section>
}

function SensorHistory({reading,onClose,onAnalyze}:{reading:Reading;onClose:()=>void;onAnalyze:(id:string)=>void}){
 const end=Date.parse(reading.measured_at),history=useWindowReadings(end-86400000,end,reading.device_id)
 return <SensorPanel reading={reading} rows={history.rows} historyLoading={history.loading&&!history.rows.length} historyError={history.error} onRetry={history.reload} onClose={onClose} onAnalyze={onAnalyze}/>
}
