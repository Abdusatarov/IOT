import {useEffect,useState} from 'react'
import {Activity,ArrowUpRight,Droplets,Thermometer} from 'lucide-react'
import type {Reading} from '../live'
import {average} from '../live'
import type {CalendarDay} from '../calendarData'
import {formatValue} from '../time'
import {Button} from './UI'
import AirMascot from './AirMascot'
import './AirSummary.css'

type Props={latest:Reading[];device:string;onAnalyze:()=>void}
const dayMs=86400000
export default function AirSummary({latest,device,onAnalyze}:Props){
 const end=latest.reduce((n,row)=>Math.max(n,Date.parse(row.measured_at)||0),0)
 return <Summary key={`${device}:${end?new Date(end).toISOString().slice(0,10):'empty'}`} latest={latest} device={device} end={end} onAnalyze={onAnalyze}/>
}
function Summary({latest,device,end,onAnalyze}:Props&{end:number}){
 const [days,setDays]=useState<CalendarDay[]>([]),[loading,setLoading]=useState(Boolean(end)),[error,setError]=useState(false),[retry,setRetry]=useState(0),[selected,setSelected]=useState('')
 const date=end?new Date(end).toISOString().slice(0,10):''
 const finish=date?Date.parse(date+'T00:00:00Z'):0
 const dates=date?Array.from({length:7},(_,i)=>new Date(finish-(6-i)*dayMs).toISOString().slice(0,10)):[]
 const firstYear=date?dates[0].slice(0,4):'',lastYear=date?date.slice(0,4):''
 useEffect(()=>{
  if(!firstYear)return
  const ctl=new AbortController()
  const years=[...new Set([firstYear,lastYear])]
  function load(){Promise.all(years.map(async year=>{
   const q=new URLSearchParams({year});if(device!=='Весь город')q.set('device_id',device)
   const response=await fetch('/api/v1/calendar?'+q,{signal:ctl.signal})
   if(!response.ok)throw Error('Calendar unavailable')
   const result=await response.json();if(!Array.isArray(result.days))throw Error('Invalid calendar')
   return result.days as CalendarDay[]
  })).then(result=>{if(!ctl.signal.aborted){setDays(result.flat());setLoading(false);setError(false)}}).catch(()=>{if(!ctl.signal.aborted){setError(true);setLoading(false)}})
  }
  load()
  const timer=setInterval(load,60000)
  return()=>{clearInterval(timer);ctl.abort()}
 },[firstYear,lastYear,device,retry])
 const raw=average(latest.map(row=>row.mq135_raw)),temperature=average(latest.map(row=>row.temperature_c)),humidity=average(latest.map(row=>row.humidity_pct))
 const lookup=new Map(days.map(day=>[day.date,day])),values=dates.flatMap(day=>{const v=lookup.get(day)?.avg;return typeof v==='number'&&Number.isFinite(v)?[v]:[]})
 const low=values.length?Math.min(...values):0,high=values.length?Math.max(...values):0
 const active=lookup.get(selected||date)
 const displayDate=(value:string)=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'))
 return <section className="air-summary" aria-labelledby="air-summary-title">
  <header className="air-summary-header"><div><span className="air-summary-brand"><Activity size={18} aria-hidden="true"/>ALMATYAIR</span><h2 id="air-summary-title">Пульс наблюдений</h2><p>{device==='Весь город'?'Средние последних показаний устройств':device}</p></div><Button variant="ghost" onClick={onAnalyze}>Анализ<ArrowUpRight size={16} aria-hidden="true"/></Button></header>
  <div className="air-summary-body"><div className="air-summary-signal"><AirMascot value={active?.avg??null} low={low} high={high} pending={loading||error}/><div><span className="air-summary-label">MQ-135 · исходный сигнал</span><p className="air-summary-value">{formatValue(raw)}<span>raw</span></p><span className="air-summary-label">{latest.length?`${latest.length} устройств в выборке`:'Ожидаем измерения'}</span></div></div>
   <div className="air-summary-history"><div className="air-summary-stats"><span><Thermometer size={17} aria-hidden="true"/>{formatValue(temperature)} °C</span><span><Droplets size={17} aria-hidden="true"/>{formatValue(humidity)} %</span></div><p className="air-summary-period">{date?`7 дней до ${displayDate(date)} · сутки UTC`:'История появится после первого измерения'}</p>
    {error?<div className="air-summary-error"><span>Не удалось загрузить историю.</span><Button onClick={()=>{setLoading(true);setError(false);setRetry(n=>n+1)}}>Повторить</Button></div>:<div className="air-summary-days" aria-label="Суточные средние MQ-135" aria-busy={loading}>{dates.map(day=>{const record=lookup.get(day),value=record?.avg??null,valid=value!==null&&Number.isFinite(value);return <button type="button" key={day} className={(selected||date)===day?'is-selected':''} aria-pressed={(selected||date)===day} aria-label={`${displayDate(day)}: ${loading?'загрузка':formatValue(value)+' raw'}`} onClick={()=>setSelected(day)}><span>{new Intl.DateTimeFormat('ru-RU',{weekday:'short',timeZone:'UTC'}).format(new Date(day+'T00:00:00Z'))}</span><i aria-hidden="true" style={{height:valid?`${high===low?28:12+(value-low)/(high-low)*32}px`:'4px',opacity:valid?1:.25}}/><strong>{loading?'…':formatValue(value)}</strong></button>})}</div>}
    <p className="air-summary-day-note">{loading?'Загружаем суточные средние…':error?'Текущие показания доступны слева.':active?`${displayDate(selected||date)}: ${active.count} записей · среднее ${formatValue(active.avg)} raw`:'Для этого дня нет измерений.'}</p>
   </div></div>
  <footer>Без калибровки · raw не является AQI или концентрацией газа. Столбики и эмоция персонажа сравнивают суточные raw внутри недели, а не безопасность воздуха.</footer>
 </section>
}
