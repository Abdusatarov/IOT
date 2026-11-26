import {useState} from 'react'
import {LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer,Brush} from 'recharts'
import {useReadings} from './live'
import type {Reading} from './live'
import {comparison} from './comparison'
import {chartTime,formatDateTime,formatValue} from './time'
import {Card,EmptyState,ErrorState,Skeleton} from './components/UI'
import './overview.css'

type ChartProps={rows:Reading[];error:string;loading:boolean;onRetry:()=>void;district:string;period:number;onPeriodChange?:(value:number)=>void}
export function MeasurementChart({rows,error,loading,onRetry,district,period,onPeriodChange}:ChartProps){
 const result=comparison(rows,period,district)
 const currentName=period===24?'Выбранные сутки':`Выбранные ${period} дней`
 const previousName=period===24?'Предыдущие сутки':`Предыдущие ${period} дней`
 const climateTemperature=comparison(rows,period,district,'temperature_c')
 const climateHumidity=comparison(rows,period,district,'humidity_pct')
 const data=(result?.data||[]).map((point,i)=>({...point,temperature:climateTemperature?.data[i]?.current??null,humidity:climateHumidity?.data[i]?.current??null}))
 const values=data.flatMap(r=>[r.current,r.previous]).filter((v):v is number=>v!==null)
 const low=values.length?Math.min(...values):0,high=values.length?Math.max(...values):1
 const padding=(high-low)*.15||1,min=Math.max(0,low-padding),max=high+padding
 const label=(index:number)=>result?chartTime(result.start+Math.round(index)*result.step,period===24):''
 return <Card className="measurement-chart">
  <div className="overview-section-heading"><div><h2>История показаний</h2><p>{district} · MQ-135, температура и влажность</p></div>{onPeriodChange&&<label className="chart-period-label">Период<select value={period} onChange={e=>onPeriodChange(+e.target.value)}><option value={24}>24 часа</option><option value={7}>7 дней</option><option value={30}>30 дней</option></select></label>}</div>
  <div className="measurement-chart-legend"><span><i/>MQ-135 · raw · {currentName}</span><span><i className="previous"/>MQ-135 · {previousName}</span><span className="chart-temperature"><i/>Температура · °C</span><span className="chart-humidity"><i/>Влажность · %</span></div>
  {loading&&!rows.length?<div className="measurement-chart-loading" role="status" aria-label="Загрузка графика"><Skeleton style={{height:240}}/></div>:error&&!rows.length?<ErrorState onRetry={onRetry}/>:result&&data.some(r=>r.current!==null||r.previous!==null||r.temperature!==null||r.humidity!==null)?<>
   <p className="measurement-chart-period">{formatDateTime(result.start)} — {formatDateTime(result.start+data.length*result.step-1)}<span>Время Алматы · UTC+5</span></p>
   <div className="measurement-chart-plot"><ResponsiveContainer width="100%" height="100%"><LineChart key={district+period} data={data} margin={{top:16,right:16,left:0,bottom:8}}>
    <CartesianGrid stroke="var(--border)" vertical={false}/>
    <XAxis dataKey="index" tickFormatter={label} minTickGap={40} tick={{fontSize:12,fill:'var(--text-muted)'}} axisLine={false} tickLine={false} tickMargin={12}/>
    <YAxis yAxisId="raw" domain={[min,max]} tick={{fontSize:12,fill:'var(--text-muted)'}} tickFormatter={formatValue} axisLine={false} tickLine={false} tickMargin={8} width={48}/>
    <YAxis yAxisId="temperature" orientation="right" domain={['auto','auto']} tick={{fontSize:11,fill:'var(--chart-temperature)'}} tickFormatter={value=>`${formatValue(Number(value))}°`} axisLine={false} tickLine={false} width={40}/>
    <YAxis yAxisId="humidity" orientation="right" domain={[0,100]} tick={{fontSize:11,fill:'var(--chart-humidity)'}} tickFormatter={value=>`${value}%`} axisLine={false} tickLine={false} width={38}/>
    <Tooltip labelFormatter={index=>{const i=Number(index);return formatDateTime(result.start+i*result.step)+' / '+formatDateTime(result.previous+i*result.step)}} formatter={(value,name)=>[`${formatValue(Number(value))} ${name==='Температура'?'°C':name==='Влажность'?'%':'raw'}`,name]} contentStyle={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,fontSize:12,color:'var(--text)'}} itemStyle={{fontFamily:'var(--font-data)'}} labelStyle={{fontFamily:'var(--font-ui)',color:'var(--text-muted)'}}/>
    <Line yAxisId="raw" type="monotoneX" strokeLinecap="round" strokeLinejoin="round" dataKey="previous" name={previousName} stroke="var(--text-muted)" strokeDasharray="4 4" strokeWidth={2} dot={false} activeDot={{r:4}} connectNulls={false} isAnimationActive={false}/>
    <Line yAxisId="raw" type="monotoneX" strokeLinecap="round" strokeLinejoin="round" dataKey="current" name={currentName} stroke="var(--accent)" strokeWidth={2} dot={false} activeDot={{r:4}} connectNulls={false} isAnimationActive={false}/>
    <Line yAxisId="temperature" type="monotoneX" dataKey="temperature" name="Температура" stroke="var(--chart-temperature)" strokeWidth={2} strokeLinecap="round" dot={false} activeDot={{r:4}} connectNulls={false} isAnimationActive={false}/>
    <Line yAxisId="humidity" type="monotoneX" dataKey="humidity" name="Влажность" stroke="var(--chart-humidity)" strokeWidth={2} strokeLinecap="round" dot={false} activeDot={{r:4}} connectNulls={false} isAnimationActive={false}/>
    <Brush dataKey="index" height={24} tickFormatter={label} stroke="var(--border)" fill="var(--surface)" travellerWidth={8}/>
   </LineChart></ResponsiveContainer></div>
   {!data.some(r=>r.previous!==null)&&<p className="measurement-chart-note">За предыдущий период показаний нет.</p>}
  </>:<EmptyState title="Нет показаний" description="Выберите другое устройство или дождитесь измерений."/>}
  <p className="measurement-chart-note">Средние значения за {period===24?'час':'день'}. Шкалы: raw слева, °C и % справа. Период отсчитывается от последней записи. Пропуски не заменяются нулями.</p>
 </Card>
}
export default function AirChart({district='Весь город'}:{unit?:boolean;district?:string}){
 const {rows,error,loading,reload}=useReadings(),[period,setPeriod]=useState(24)
 return <MeasurementChart rows={rows} error={error} loading={loading} onRetry={reload} district={district} period={period} onPeriodChange={setPeriod}/>
}
