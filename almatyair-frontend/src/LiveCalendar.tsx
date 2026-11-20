import {useEffect,useRef,useState} from 'react'
import type {CSSProperties} from 'react'
import {CalendarDays} from 'lucide-react'
import {Button,Card,DeviceCombobox,EmptyState,ErrorState,Skeleton} from './components/UI'
import {calendarDate,calendarLayout,calendarLevel} from './calendarData'
import type {CalendarDay} from './calendarData'
import {formatValue,TIME_ZONE} from './time'
import './calendar-page.css'

export default function LiveCalendar({district,devices,onDevice}:{district:string;devices:string[];onDevice:(device:string)=>void}){
 const currentYear=Math.min(2100,Number(new Intl.DateTimeFormat('en',{timeZone:TIME_ZONE,year:'numeric'}).format(new Date())))
 const [year,setYear]=useState(currentYear),[retry,setRetry]=useState(0)
 return <div className="calendar-page"><div className="calendar-page-heading"><p>ИСТОРИЯ НАБЛЮДЕНИЙ</p><h1>Календарь измерений</h1><span>Год наблюдений — день за днём.</span></div>
  <div className="calendar-controls"><DeviceCombobox devices={devices} value={district} onChange={onDevice}/><label className="calendar-year">Год<select value={year} onChange={event=>setYear(Number(event.target.value))}>{Array.from({length:currentYear-2000+1},(_,i)=>currentYear-i).map(value=><option key={value}>{value}</option>)}</select></label><span className="calendar-metric-label">MQ-135 raw · без калибровки</span></div>
  <CalendarYear key={`${year}:${district}:${retry}`} year={year} district={district} onRetry={()=>setRetry(value=>value+1)}/>
 </div>
}
function CalendarYear({year,district,onRetry}:{year:number;district:string;onRetry:()=>void}){
 const [days,setDays]=useState<CalendarDay[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState('')
 const grid=useRef<HTMLDivElement>(null)
 useEffect(()=>{const ctl=new AbortController(),q=new URLSearchParams({year:String(year)});if(district!=='Весь город')q.set('device_id',district)
  fetch('/api/v1/calendar?'+q,{signal:ctl.signal}).then(async response=>{if(!response.ok)throw Error('HTTP '+response.status);return response.json()}).then(result=>{if(!ctl.signal.aborted){setDays(result.days);setLoading(false)}}).catch(reason=>{if(!ctl.signal.aborted){setError(String(reason));setLoading(false)}})
  return()=>ctl.abort()
 },[year,district])
 const {offset,length,columns,dates}=calendarLayout(year),lookup=new Map(days.map(day=>[day.date,day])),values=days.flatMap(day=>day.avg===null?[]:[day.avg]),min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):1
 const current=selected?lookup.get(selected):undefined,activeDays=days.filter(day=>day.count>0).length,total=days.reduce((sum,day)=>sum+day.count,0)
 const caption=(date:string)=>{const day=lookup.get(date);return `${calendarDate(date)} · ${day?`${formatValue(day.avg)} raw · ${day.count} записей`:'нет данных'}`}
 return <><Card className="calendar-year-card"><div className="calendar-grid-heading"><div><h2>{year}</h2><p>{district} · средние за сутки UTC · 05:00–05:00 в Алматы</p></div><CalendarDays size={20} strokeWidth={1.5} aria-hidden="true"/></div>
  {loading?<div className="calendar-loading" role="status" aria-label="Загрузка календаря"><Skeleton style={{height:140}}/><Skeleton style={{height:44,width:'60%'}}/></div>:error?<ErrorState onRetry={onRetry}/>:<>
   <div className="calendar-year-scroll" tabIndex={0} role="region" aria-label="Годовая сетка, прокручивается по горизонтали"><div className="calendar-year-content" style={{'--calendar-columns':columns,'--calendar-min-width':`${columns*17-3+28}px`} as CSSProperties}>
    <div className="calendar-month-labels">{Array.from({length:12},(_,month)=>{const week=Math.floor((offset+(Date.UTC(year,month,1)-Date.UTC(year,0,1))/86400000)/7);return <span key={month} style={{left:`calc((100% + 3px) * ${week} / ${columns})`}}>{new Intl.DateTimeFormat('ru-RU',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,month,1)))}</span>})}</div>
    <div className="calendar-grid-body"><div className="calendar-week-labels">{['Пн','','Ср','','Пт','','Вс'].map((label,index)=><span key={index}>{label}</span>)}</div><div className="calendar-year-grid" ref={grid} aria-label="Дни года">
     {Array.from({length:offset},(_,i)=><span key={`empty-${i}`} aria-hidden="true"/>)}{dates.map((date,index)=>{const day=lookup.get(date),level=day?calendarLevel(day.avg,values):null;return <button type="button" key={date} data-date={date} data-level={level??'none'} data-present={Boolean(day)} aria-label={caption(date)} aria-pressed={selected===date} title={caption(date)} tabIndex={date===(selected||dates[0])?0:-1} onMouseEnter={()=>setSelected(date)} onFocus={()=>setSelected(date)} onClick={()=>setSelected(date)} onKeyDown={event=>{const step=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:event.key==='ArrowRight'?7:event.key==='ArrowLeft'?-7:event.key==='Home'?-index:event.key==='End'?length-1-index:0;if(!step)return;event.preventDefault();const next=dates[Math.max(0,Math.min(length-1,index+step))];grid.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus()}}/>})}
    </div></div></div></div>
   <div className="calendar-legend"><span>Меньше raw</span><div aria-label="Пять уровней относительной шкалы">{[0,1,2,3,4].map(level=>{const group=values.filter(value=>calendarLevel(value,values)===level);return <i key={level} data-level={level} title={group.length?`${formatValue(Math.min(...group))}–${formatValue(Math.max(...group))} raw · ${group.length} дн.`:'Нет дней в этой группе'}/>})}</div><span>Больше raw</span><span className="calendar-empty-key"><i/>Нет данных</span></div>
   <p className="calendar-scale-note">{values.length?`Относительная шкала: ${formatValue(min)}–${formatValue(max)} raw.`:'Нет значений MQ-135 для цветовой шкалы.'} Цвета — пять групп по рангу суточных средних за выбранный год. Одинаковые значения имеют одинаковый цвет. Это не пороги безопасности воздуха.</p>
   {!days.length&&<EmptyState title="За этот год пока нет измерений" description="Выберите другое устройство или год."/>}
   <div className="calendar-day-detail"><div className="calendar-day-picker"><label htmlFor="calendar-day">Выбрать день</label><input id="calendar-day" type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={selected} onChange={event=>{if(dates.includes(event.target.value))setSelected(event.target.value)}}/></div>{selected?<div className="calendar-day-values" aria-live="polite"><strong>{calendarDate(selected)}</strong><span>Среднее <b>{formatValue(current?.avg??null)} raw</b></span><span>Записей <b>{current?.count??0}</b></span><span>Мин. / макс. <b>{formatValue(current?.min??null)} / {formatValue(current?.max??null)} raw</b></span>{!current&&<small>Измерений за этот день нет.</small>}{current&&current.avg===null&&<small>Записи есть, но значения MQ-135 отсутствуют.</small>}</div>:<p>Наведите указатель на день, выберите его с клавиатуры или укажите дату.</p>}</div>
  </>}
 </Card><section className="calendar-summary" aria-label="Итоги года">{[{label:'Дней с данными',value:activeDays},{label:'Дней без данных',value:length-activeDays},{label:'Всего измерений',value:total}].map(item=><div key={item.label}><span>{item.label}</span>{loading?<Skeleton style={{height:40,width:80}}/>:<strong>{error?'—':item.value.toLocaleString('ru-RU')}</strong>}</div>)}</section>
 <p className="calendar-footnote">Дни календаря сгруппированы сервером по UTC (граница суток UTC — 05:00 в Алматы). Пустые дни не означают чистый воздух. Ячейка с записями без MQ-135 отмечена контуром.</p>
 {!loading&&!error&&selected&&<Button variant="ghost" onClick={()=>setSelected('')}>Снять выбор дня</Button>}
 </>
}
