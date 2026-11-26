import {useMemo,useState} from 'react'
import {ArrowDownRight,ArrowUpRight,ArrowUpRight as OpenIcon,CalendarDays,Droplets,Info,MapPin,Minus,Radio,Thermometer} from 'lucide-react'
import type {Reading} from './live'
import {average} from './live'
import {comparison} from './comparison'
import {MapCanvas} from './AirMap'
import {mergeReadings,useWindowReadings} from './scopedReadings'
import {MeasurementChart} from './AirChart'
import {Button,Card,DeviceCombobox,Notice,SegmentedControl,Skeleton,EmptyState} from './components/UI'
import type {Page} from './navigation'
import {formatDateTime,formatValue} from './time'
import AirSummary from './components/AirSummary'
import './overview.css'

type Props={rows:Reading[];latest:Reading[];devices:string[];district:string;onDevice:(value:string)=>void;error:string;loading:boolean;onRetry:()=>void;palette:string[];min:number;max:number;onNavigate:(page:Page)=>void}
export default function Overview({rows,latest,devices,district,onDevice,error,loading,onRetry,palette,min,max,onNavigate}:Props){
 const [period,setPeriod]=useState('24'),[notice,setNotice]=useState(true)
 const bounds=comparison(latest,Number(period),district)
 const window=useWindowReadings(bounds?.previous??null,bounds?bounds.start+bounds.step*bounds.data.length-1:null,district)
 const historyPending=window.loading&&!window.rows.length
 const chartRows=useMemo(()=>mergeReadings(rows,window.rows),[rows,window.rows])
 const previous=useMemo(()=>{
  const window=comparison(chartRows,Number(period),district)
  if(!window)return []
  const records=chartRows.filter(row=>(district==='Весь город'||row.device_id===district)&&Date.parse(row.measured_at)>=window.previous&&Date.parse(row.measured_at)<window.start)
  // The same latest-record-per-device aggregation used by the existing overview.
  return [...new Map([...records].sort((a,b)=>Date.parse(b.measured_at)-Date.parse(a.measured_at)).map(row=>[row.device_id,row] as const).reverse()).values()]
 },[chartRows,period,district])
 const metrics=[{key:'mq135_raw' as const,label:'MQ-135',unit:'raw',deltaUnit:'raw',icon:Radio},{key:'temperature_c' as const,label:'Температура',unit:'°C',deltaUnit:'°C',icon:Thermometer},{key:'humidity_pct' as const,label:'Влажность',unit:'%',deltaUnit:'п.п.',icon:Droplets}]
 const lastTime=latest.reduce((max,row)=>Math.max(max,Date.parse(row.measured_at)||0),0)
 const scoped=rows.filter(row=>district==='Весь город'||row.device_id===district)
 const hasDemo=scoped.some(row=>row.is_synthetic===true)
 const hasCoordinates=latest.some(row=>row.latitude!==null&&row.longitude!==null)
 return <div className="overview-page">
  {notice&&<Notice onDismiss={()=>setNotice(false)}>MQ-135 raw — исходный сигнал без калибровки. По нему нельзя определить AQI или концентрацию газа.</Notice>}
  <div className="overview-heading"><div><p className="overview-eyebrow">ПОКАЗАНИЯ ДАТЧИКОВ</p><h1>Обзор измерений</h1><p>Последние доступные показания устройств в Алматы.</p></div>{hasDemo&&<span className="overview-demo">Есть демоданные</span>}</div>
  <AirSummary latest={latest} device={district} onAnalyze={()=>onNavigate('analytics')}/>
  <div className="overview-filters"><DeviceCombobox devices={devices} value={district} onChange={onDevice}/><div className="overview-period"><span className="ui-label">Период сравнения</span><SegmentedControl label="Период обзора" value={period} onChange={setPeriod} options={[{value:'24',label:'24 ч'},{value:'7',label:'7 д'},{value:'30',label:'30 д'}]}/></div></div>
  {error&&rows.length>0&&<Notice kind="warning"><div className="overview-refresh-error"><span>Не удалось обновить данные. Показаны последние загруженные измерения.</span><Button onClick={onRetry}>Повторить</Button></div></Notice>}
  <div className="overview-metrics">{metrics.map(({key,label,unit,deltaUnit,icon:Icon})=>{
   const current=average(latest.map(row=>row[key])),before=average(previous.map(row=>row[key]))
   const delta=current!==null&&before!==null?Math.round((current-before)*10)/10:null
   const DeltaIcon=delta===null||delta===0?Minus:delta>0?ArrowUpRight:ArrowDownRight
   return <Card className="overview-metric" key={key}><div className="overview-metric-label"><span>{label}</span><Icon size={20} strokeWidth={1.5} aria-hidden="true"/></div>{loading&&!rows.length?<Skeleton className="overview-value-skeleton"/>:<div className="overview-metric-value" data-testid={`metric-${key}`}><strong>{formatValue(current)}</strong><span>{unit}</span></div>}<div className="overview-metric-delta"><DeltaIcon size={16} strokeWidth={1.5} aria-hidden="true"/><span>{historyPending?'Загружается сравнение…':window.error?'Не удалось загрузить сравнение':delta===null?'Нет данных для сравнения':`${delta>0?'+':''}${formatValue(delta)} ${deltaUnit} к предыдущему периоду`}</span></div><p>Среднее последних показаний устройств</p></Card>
  })}</div>
  <MeasurementChart rows={historyPending||(window.error&&!window.rows.length)?[]:chartRows} district={district} period={Number(period)} error={error||window.error} loading={loading||historyPending} onRetry={()=>{onRetry();window.reload()}}/>
  <Card className="overview-map-card"><div className="overview-section-heading"><div><h2>Устройства на карте</h2><p><MapPin size={14} strokeWidth={1.5} aria-hidden="true"/>Алматы · {district==='Весь город'?'все устройства':district}</p></div><Button onClick={()=>onNavigate('map')}>Открыть карту<OpenIcon size={16} strokeWidth={1.5}/></Button></div><div className="overview-mini-map">{loading&&!rows.length?<Skeleton style={{height:'100%'}}/>:!hasCoordinates?<EmptyState title="Нет точек на карте" description="Измерения без GPS сохраняются в истории и на графиках."/>:<MapCanvas stations={latest} compact palette={palette} min={min} max={max} onSelect={row=>{onDevice(row.device_id);onNavigate('map')}}/>}</div><p className="overview-map-note"><Info size={14} strokeWidth={1.5} aria-hidden="true"/>Цвет маркеров показывает относительное значение raw, а не уровень опасности.</p></Card>
  <div className="overview-bottom"><Button variant="ghost" onClick={()=>onNavigate('calendar')}><CalendarDays size={20} strokeWidth={1.5}/>Открыть календарь<OpenIcon size={16} strokeWidth={1.5}/></Button><span>{lastTime?`Последняя запись: ${formatDateTime(lastTime)} · Алматы`:'Измерения ещё не загружены'}</span></div>
 </div>
}
