import {useState} from 'react'
import {LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer,Brush,ReferenceArea} from 'recharts'
import {useReadings} from './live'
import {comparison} from './comparison'

const stamp=(t:number)=>new Date(t).toLocaleString('ru-RU',{timeZone:'UTC',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
export default function AirChart({district='Весь город'}:{unit?:boolean;district?:string}){
 const {rows,error}=useReadings(),[period,setPeriod]=useState(24)
 const result=comparison(rows,period,district)
 const currentName=period===24?'Последний день':'Последние '+period+' дней'
 const previousName=period===24?'Предыдущий день':'Предыдущие '+period+' дней'
 const data=result?.data||[]
 const values=data.flatMap(r=>[r.current,r.previous]).filter((v):v is number=>v!==null)
 const low=values.length?Math.min(...values):0,high=values.length?Math.max(...values):1
 const padding=(high-low)*.15||1,min=Math.max(0,low-padding),max=high+padding
 const label=(index:number)=>result?new Date(result.start+Math.round(index)*result.step).toLocaleString('ru-RU',period===24?{timeZone:'UTC',hour:'2-digit',minute:'2-digit'}:{timeZone:'UTC',day:'2-digit',month:'2-digit'}):''
 return <section className="card chart-card"><div className="card-heading"><h2>{period===24?'24 часа':period+' дней'} · MQ-135 raw</h2><select aria-label="Период графика" value={period} onChange={e=>setPeriod(+e.target.value)}><option value={24}>24 часа</option><option value={7}>7 дней</option><option value={30}>30 дней</option></select></div>
 <p className="chart-legend"><span>●</span> {currentName} <span className="muted-dot">●</span> {previousName}</p>
 {error&&<p role="alert">{error}</p>}
 {result?<><p className="muted" style={{fontSize:11}}>{district} · UTC<br/>{currentName}: {stamp(result.start)} — {stamp(result.start+data.length*result.step-1)}<br/>{previousName}: {stamp(result.previous)} — {stamp(result.start-1)}</p>
 <ResponsiveContainer width="100%" height={280}><LineChart key={district+period} data={data} margin={{top:10,right:10,left:-15,bottom:5}}>
 <CartesianGrid stroke="var(--line)" vertical={false}/><XAxis dataKey="index" tickFormatter={label} minTickGap={40} tick={{fontSize:10,fill:'#8490a4'}}/><YAxis domain={[min,max]} tick={{fontSize:10,fill:'#8490a4'}}/>
 <ReferenceArea y1={min} y2={min+(max-min)/3} fill="#f5dcba" fillOpacity={.15}/><ReferenceArea y1={min+(max-min)/3} y2={min+2*(max-min)/3} fill="#ce8854" fillOpacity={.1}/><ReferenceArea y1={min+2*(max-min)/3} y2={max} fill="#833c24" fillOpacity={.08}/>
 <Tooltip labelFormatter={index=>{const i=Number(index);return stamp(result.start+i*result.step)+' / '+stamp(result.previous+i*result.step)}} contentStyle={{background:'var(--card)',border:'1px solid var(--line)',borderRadius:12}}/>
 <Line type="linear" dataKey="previous" name={previousName} stroke="#a7ccff" strokeDasharray="4 4" strokeWidth={2} dot={false} connectNulls={false}/>
 <Line type="linear" dataKey="current" name={currentName} stroke="#347efa" strokeWidth={3} dot={false} connectNulls={false}/>
 <Brush dataKey="index" height={26} tickFormatter={label}/></LineChart></ResponsiveContainer>
 {!data.some(r=>r.previous!==null)&&<p className="muted">За предыдущий период измерений нет.</p>}
 </>:<p className="muted">Нет измерений для выбранного устройства.</p>}
 <small className="muted">Среднее raw за {period===24?'час':'день'} · пропуски не заменяются нулями. Цветные зоны относительные, не пороги качества воздуха. Ползунки выбирают участок графика.</small></section>
}
