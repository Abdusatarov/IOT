import {useMemo} from 'react'
import {ArrowUpRight,MapPin} from 'lucide-react'
import {CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts'
import type {Reading} from './live'
import {chartTime,formatDateTime,formatValue} from './time'
import {Button,EmptyState,ErrorState,Skeleton} from './components/UI'
import MapDrawer from './components/MapDrawer'

export default function SensorPanel({reading,rows,onClose,onAnalyze,historyLoading=false,historyError='',onRetry}:{reading:Reading;rows:Reading[];historyLoading?:boolean;historyError?:string;onRetry?:()=>void;onClose:()=>void;onAnalyze:(id:string)=>void}){
 const end=Date.parse(reading.measured_at),start=end-86400000
 const history=useMemo(()=>rows.filter(row=>row.device_id===reading.device_id&&Date.parse(row.measured_at)>=start&&Date.parse(row.measured_at)<=end).sort((a,b)=>Date.parse(a.measured_at)-Date.parse(b.measured_at)).map(row=>({time:Date.parse(row.measured_at),raw:row.mq135_raw})),[rows,reading.device_id,start,end])
 return <MapDrawer title={reading.device_id} onClose={onClose} footer={<Button className="sensor-analysis-button" variant="primary" onClick={()=>onAnalyze(reading.device_id)}>Открыть в анализе<ArrowUpRight size={18} strokeWidth={1.5}/></Button>}>
  <div className="sensor-panel-meta"><span>Показания на выбранный момент</span>{reading.is_synthetic===true&&<span className="sensor-demo">Демо</span>}</div>
  <time className="sensor-panel-time" dateTime={reading.measured_at}>{formatDateTime(reading.measured_at)} · Алматы</time>
  <div className="sensor-panel-values">{[['MQ-135',reading.mq135_raw,'raw'],['Температура',reading.temperature_c,'°C'],['Влажность',reading.humidity_pct,'%']].map(([label,value,unit])=><div key={String(label)}><span>{label}</span><strong>{formatValue(value as number|null)}<small>{unit}</small></strong></div>)}</div>
  <div className="sensor-mini-heading"><h3>История MQ-135</h3><span>24 ч · raw</span></div>
  {historyLoading?<div className="sensor-mini-chart" role="status" aria-label="Загрузка истории датчика"><Skeleton style={{height:160}}/></div>:historyError?<ErrorState onRetry={onRetry??(()=>{})}/>:history.some(point=>point.raw!==null)?<div className="sensor-mini-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={history} margin={{top:8,right:8,left:0,bottom:0}}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="time" type="number" domain={[start,end]} tickFormatter={time=>chartTime(Number(time),true)} tick={{fill:'var(--text-muted)',fontSize:12}} axisLine={false} tickLine={false} minTickGap={32}/><YAxis width={36} tick={{fill:'var(--text-muted)',fontSize:12}} axisLine={false} tickLine={false} domain={['auto','auto']}/><Tooltip labelFormatter={time=>formatDateTime(Number(time))} formatter={value=>[`${formatValue(Number(value))} raw`,'MQ-135']} contentStyle={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:12}} itemStyle={{fontFamily:'var(--font-data)'}}/><Line type="monotoneX" strokeLinecap="round" strokeLinejoin="round" dataKey="raw" stroke="var(--accent)" strokeWidth={2} dot={false} activeDot={{r:4}} connectNulls={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>:<EmptyState title="Нет показаний для графика" description="В выбранных 24 часах нет значений MQ-135."/>}
  <p className="map-setting-caption">{formatDateTime(start)} — {formatDateTime(end)}. Время Алматы.</p>
  <details className="sensor-coordinates"><summary><MapPin size={16} strokeWidth={1.5}/>Координаты и точность GPS</summary><dl><div><dt>Широта</dt><dd>{reading.latitude?.toFixed(5)??'—'}</dd></div><div><dt>Долгота</dt><dd>{reading.longitude?.toFixed(5)??'—'}</dd></div><div><dt>Высота</dt><dd>{formatValue(reading.altitude_m??null)} м</dd></div><div><dt>Точность GPS</dt><dd>{formatValue(reading.gps_accuracy_m)} м</dd></div></dl></details>
  <p className="map-setting-caption">Исходный сигнал без калибровки. Не AQI и не концентрация газа.</p>
 </MapDrawer>
}
