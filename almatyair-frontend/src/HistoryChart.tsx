import {useId,useMemo,useRef,useState} from 'react'
import {Maximize2,Minus,Plus} from 'lucide-react'
import {CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts'
import type {Reading} from './live'
import {withHistoryGaps} from './historySeries'
import {chartTime,formatDateTime,formatValue} from './time'
import {Button,EmptyState} from './components/UI'

const metrics={mq135_raw:{label:'MQ-135',unit:'raw'},temperature_c:{label:'Температура',unit:'°C'},humidity_pct:{label:'Влажность',unit:'%'},gps_accuracy_m:{label:'Точность GPS',unit:'м'}}
type Metric=keyof typeof metrics
const hour=3600000
export default function HistoryChart({rows}:{rows:Reading[]}){
 const [metric,setMetric]=useState<Metric>('mq135_raw'),[zoom,setZoom]=useState(1),[position,setPosition]=useState(1)
 const drag=useRef<{x:number;position:number}|null>(null),tabs=useRef<HTMLDivElement>(null),id=useId()
 const points=useMemo(()=>withHistoryGaps(rows.map(row=>({time:Date.parse(row.measured_at),value:row[metric]}))),[rows,metric])
 if(!points.length)return <EmptyState title="Нет измерений за этот период" description="Выберите другой период или устройство."/>
 const first=points[0].time
 const last=Math.max(first+1,points[points.length-1].time)
 const span=last-first
 const maxZoom=Math.max(1,span/hour),actualZoom=Math.min(zoom,maxZoom)
 const width=Math.max(Math.min(span,hour),span/actualZoom)
 const travel=span-width
 const left=first+travel*position
 const right=left+width
 const shown=points.filter(point=>point.time>=left&&point.time<=right)
 const {label,unit}=metrics[metric]
 const available=shown.filter(point=>point.value!==null)
 function changeZoom(factor:number){setZoom(current=>Math.max(1,Math.min(maxZoom,Math.min(current,maxZoom)*factor)))}
 return <>
  <div className="history-metric-tabs" role="tablist" aria-label="Показатель графика" ref={tabs}>{Object.entries(metrics).map(([key,item],index)=><button key={key} id={`${id}-${key}`} type="button" role="tab" aria-controls={`${id}-chart`} aria-selected={metric===key} tabIndex={metric===key?0:-1} onClick={()=>setMetric(key as Metric)} onKeyDown={event=>{
   if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return
   event.preventDefault()
   const keys=Object.keys(metrics) as Metric[],next=event.key==='Home'?0:event.key==='End'?keys.length-1:(index+(event.key==='ArrowRight'?1:keys.length-1))%keys.length
   setMetric(keys[next]);tabs.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus()
  }}>{item.label}</button>)}</div>
  <div className="history-toolbar"><div className="history-zoom"><Button variant="ghost" className="ui-icon-button" aria-label="Приблизить график" disabled={actualZoom>=maxZoom} onClick={()=>changeZoom(2)}><Plus size={18} strokeWidth={1.5}/></Button><Button variant="ghost" className="ui-icon-button" aria-label="Отдалить график" disabled={actualZoom<=1} onClick={()=>changeZoom(.5)}><Minus size={18} strokeWidth={1.5}/></Button><Button variant="ghost" onClick={()=>{setZoom(1);setPosition(1)}}><Maximize2 size={16} strokeWidth={1.5}/>Весь период</Button></div><span className="history-zoom-level">{formatValue(actualZoom)}×</span></div>
  <div className="history-time-range"><span>{formatDateTime(left)} — {formatDateTime(right)}</span><span>Алматы · UTC+5</span></div>
  {available.length===1&&<p className="history-single-point" role="status">На участке одно показание: <strong>{formatValue(available[0].value)} {unit}</strong>. Для линии нужны хотя бы два.</p>}
  <div id={`${id}-chart`} role="tabpanel" aria-labelledby={`${id}-${metric}`} className="history-panel">
   <div className="history-plot" onPointerDown={event=>{if(event.button!==0||travel<=0)return;drag.current={x:event.clientX,position};event.currentTarget.setPointerCapture(event.pointerId)}} onPointerMove={event=>{if(!drag.current||travel<=0)return;const offset=(event.clientX-drag.current.x)/event.currentTarget.clientWidth*width/travel;setPosition(Math.max(0,Math.min(1,drag.current.position-offset)))}} onLostPointerCapture={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}>
    {shown.some(point=>point.value!==null)?<ResponsiveContainer width="100%" height="100%"><LineChart data={shown} margin={{top:16,right:16,left:0,bottom:12}}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis type="number" dataKey="time" domain={[left,right]} tickFormatter={time=>chartTime(Number(time),width<=48*hour)} minTickGap={48} tick={{fontSize:12,fill:'var(--text-muted)'}} axisLine={false} tickLine={false} tickMargin={12}/><YAxis domain={['auto','auto']} tickFormatter={formatValue} tick={{fontSize:12,fill:'var(--text-muted)'}} axisLine={false} tickLine={false} width={44}/><Tooltip labelFormatter={time=>formatDateTime(Number(time))} formatter={value=>[`${formatValue(Number(value))} ${unit}`,label]} contentStyle={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:12}} itemStyle={{fontFamily:'var(--font-data)'}}/><Line type="monotoneX" strokeLinecap="round" strokeLinejoin="round" dataKey="value" name={label} stroke="var(--accent)" strokeWidth={2} dot={false} activeDot={{r:4}} connectNulls={false} isAnimationActive={false}/></LineChart></ResponsiveContainer>:<EmptyState title="Нет значений этого показателя" description="Данные отсутствуют на выбранном участке времени."/>}
   </div><div className="history-unit">{label} · {unit}</div>
  </div>
  <label className="history-position">Положение на шкале времени<input type="range" min="0" max="1000" value={Math.round(position*1000)} disabled={travel<=0} onChange={event=>setPosition(Number(event.target.value)/1000)}/></label>
  <p className="history-help">Приблизьте график, затем перетащите его или переместите ползунок. Паузы больше 6 часов показаны разрывами.</p>
 </>
}
