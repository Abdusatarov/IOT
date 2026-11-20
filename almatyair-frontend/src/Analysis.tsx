import {Suspense,useEffect,useMemo,useRef,useState} from 'react'
import type {ReactNode} from 'react'
import {ArrowDownRight,ArrowUpRight,ChevronDown,List,Maximize2,Minimize2,Minus,PanelLeftClose,Search} from 'lucide-react'
import {average} from './live'
import {readPreference,savePreference} from './navigation'
import type {Reading} from './live'
import {analysisGroups} from './analysisData'
import {formatDateTime,formatValue} from './time'
import HistoryChart from './HistoryChart'
import {Button,Card,DeviceCombobox,EmptyState,ErrorState,Notice,SegmentedControl,Skeleton} from './components/UI'
import './analysis-page.css'

type Props={rows:Reading[];initialDevice?:string;loading?:boolean;error?:string;onRetry:()=>void;comparison?:(device:string)=>ReactNode}
export default function Analysis({rows,initialDevice,loading=false,error='',onRetry,comparison}:Props){
 const [period,setPeriod]=useState(initialDevice?0:720),[search,setSearch]=useState(''),[device,setDevice]=useState(initialDevice??''),[deviceFilter,setDeviceFilter]=useState('Весь город'),[comparisonOpen,setComparisonOpen]=useState(false)
 const [fullscreen,setFullscreen]=useState(false),[listHidden,setListHidden]=useState(()=>readPreference('almatyair.analysisListHidden','0')==='1')
 const chart=useRef<HTMLElement>(null),fullButton=useRef<HTMLButtonElement>(null)
 useEffect(()=>{
  if(!fullscreen)return
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow
  document.body.style.overflow='hidden';document.body.classList.add('analysis-fullscreen-active')
  const background=Array.from(document.querySelectorAll<HTMLElement>('.shell-sidebar,.shell-topbar,.shell-mobile-nav,.shell-welcome,.analysis-page-heading,.analysis-top-controls,.analysis-network-summary,.analysis-workspace-toolbar,.analysis-device-list,.analysis-period-comparison,.analysis-footnote,.analysis-refresh-error'))
  const inert=background.map(node=>node.inert);background.forEach(node=>{node.inert=true})
  fullButton.current?.focus({preventScroll:true})
  const resizeFrame=requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')))
  function key(event:KeyboardEvent){
   if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();setFullscreen(false)}
   if(event.key==='Tab'){
    const controls=Array.from(chart.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select,[tabindex="0"]')??[]).filter(node=>node.getClientRects().length)
    const first=controls[0],last=controls[controls.length-1]
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
   }
  }
  document.addEventListener('keydown',key)
  return()=>{cancelAnimationFrame(resizeFrame);document.body.style.overflow=overflow;document.body.classList.remove('analysis-fullscreen-active');background.forEach((node,index)=>{node.inert=inert[index]});document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true})}
 },[fullscreen])
 function toggleList(){setListHidden(!listHidden);savePreference('almatyair.analysisListHidden',listHidden?'0':'1')}

 const {groups,count}=useMemo(()=>analysisGroups(rows,period),[rows,period])
 const selected=device?groups.find(group=>group.id===device):groups[0]
 const shown=groups.filter(group=>(deviceFilter==='Весь город'||group.id===deviceFilter)&&group.id.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
 const latest=groups.map(group=>group.latest)
 const devices=[...new Set(rows.map(row=>row.device_id))].sort()
 function filter(id:string){setDeviceFilter(id);if(id!=='Весь город')setDevice(id)}
 function choose(id:string){setDevice(id);chart.current?.scrollIntoView({block:'nearest'})}
 return <div className="analysis-page">
  <div className="analysis-page-heading"><div><p>ИСТОРИЯ И СРАВНЕНИЕ</p><h1>Анализ измерений</h1><span>От общей картины — к истории отдельного устройства.</span></div><span className="analysis-data-label">MQ-135 raw · без калибровки</span></div>
  <div className="analysis-top-controls"><DeviceCombobox devices={devices} value={deviceFilter} onChange={filter} label="Устройства в списке"/><div className="analysis-periods"><span className="ui-label">Период анализа</span><SegmentedControl label="Период анализа" value={String(period)} onChange={value=>setPeriod(Number(value))} options={[{value:'24',label:'Сутки'},{value:'168',label:'Неделя'},{value:'720',label:'Месяц'},{value:'0',label:'Вся история'}]}/></div></div>
  {error&&rows.length>0&&<Notice kind="warning"><div className="analysis-refresh-error"><span>Не удалось обновить данные. Показана последняя загруженная история.</span><Button onClick={onRetry}>Повторить</Button></div></Notice>}
  <section className="analysis-network-summary" aria-label="Сводка сети за период">{[
   {label:'Устройства',value:groups.length.toLocaleString('ru-RU'),unit:'в выбранном периоде'},
   {label:'Измерения',value:count.toLocaleString('ru-RU'),unit:'в выбранном периоде'},
   {label:'Ср. температура',value:formatValue(average(latest.map(row=>row.temperature_c))),unit:'°C · последние показания'},
   {label:'Ср. влажность',value:formatValue(average(latest.map(row=>row.humidity_pct))),unit:'% · последние показания'},
  ].map(({label,value,unit})=><div key={label}><span>{label}</span>{loading&&!rows.length?<Skeleton style={{height:32,width:'50%'}}/>:<strong>{error&&!rows.length?'—':value}</strong>}<small>{unit}</small></div>)}</section>
  {error&&!rows.length?<ErrorState onRetry={onRetry}/>:<><div className="analysis-workspace-toolbar"><Button variant="ghost" aria-expanded={!listHidden} aria-controls="analysis-device-list" onClick={toggleList}>{listHidden?<List size={18} strokeWidth={1.5}/>:<PanelLeftClose size={18} strokeWidth={1.5}/>}{listHidden?'Показать список':'Скрыть список'}</Button></div><div className={`analysis-workspace ${listHidden?'is-list-hidden':''}`}>

   <Card className="analysis-device-list" id="analysis-device-list" hidden={listHidden}><div className="analysis-list-heading"><h2>Устройства</h2><span>{shown.length} из {groups.length}</span></div><div className="analysis-list-search"><Search size={18} strokeWidth={1.5} aria-hidden="true"/><input type="search" aria-label="Поиск по датчикам" placeholder="Найти устройство" value={search} onChange={event=>setSearch(event.target.value)}/></div>
    {loading&&!rows.length?<div className="analysis-list-loading" role="status" aria-label="Загрузка списка устройств">{[0,1,2,3].map(i=><Skeleton key={i} style={{height:44}}/>)}</div>:<div className="analysis-devices-scroll"><table className="analysis-devices-table"><thead><tr><th scope="col">Устройство</th><th scope="col">raw</th><th scope="col">Время</th><th scope="col">Записей</th><th scope="col">Δ raw</th></tr></thead><tbody>{shown.map(({id,history,latest,delta})=>{const Delta=delta===null||delta===0?Minus:delta>0?ArrowUpRight:ArrowDownRight;return <tr key={id} data-selected={selected?.id===id}><td><button type="button" className="analysis-select-device" aria-label={`Выбрать ${id}`} aria-pressed={selected?.id===id} onClick={()=>choose(id)}>{id}</button>{history.some(row=>row.is_synthetic===true)&&<span className="analysis-demo">Есть демо</span>}</td><td className="analysis-cell-value">{formatValue(latest.mq135_raw)}</td><td><time dateTime={latest.measured_at}>{formatDateTime(latest.measured_at)}</time></td><td className="analysis-cell-value">{history.length.toLocaleString('ru-RU')}</td><td className="analysis-cell-value"><span className="analysis-delta"><Delta size={14} strokeWidth={1.5} aria-hidden="true"/>{delta!==null&&delta>0?'+':''}{formatValue(delta)}</span></td></tr>})}</tbody></table>{!shown.length&&<EmptyState title={groups.length?'Устройства не найдены':'Нет измерений за этот период'} description="Измените поиск, устройство или период анализа."/>}</div>}
    <p className="analysis-table-mobile-hint">Таблицу можно прокручивать по горизонтали.</p>
    <p className="analysis-list-note">Δ raw — разница между первым и последним доступными значениями за период. Время Алматы.</p>
   </Card>
   <section className={`ui-card analysis-history ${fullscreen?'is-fullscreen':''}`} ref={chart} role={fullscreen?'dialog':undefined} aria-modal={fullscreen||undefined} aria-label="Подробный график датчика"><div className="analysis-history-heading"><div><span className="ui-label">История устройства</span><h2>{selected?.id||device||'Выберите устройство'}</h2></div><div className="analysis-history-actions">{fullscreen&&<label className="analysis-fullscreen-period">Период<select aria-label="Период полноэкранного графика" value={period} onChange={event=>setPeriod(Number(event.target.value))}>{[{value:24,label:'Сутки'},{value:168,label:'Неделя'},{value:720,label:'Месяц'},{value:0,label:'Вся история'}].map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}<button ref={fullButton} type="button" className="ui-button ui-button--ghost analysis-fullscreen-toggle" aria-label={fullscreen?'Закрыть полный экран':'Во весь экран'} aria-expanded={fullscreen} onClick={()=>setFullscreen(!fullscreen)}>{fullscreen?<Minimize2 size={18} strokeWidth={1.5}/>:<Maximize2 size={18} strokeWidth={1.5}/>}<span>{fullscreen?'Закрыть':'Во весь экран'}</span></button></div></div>
    {loading&&!rows.length?<div className="analysis-history-loading" role="status" aria-label="Загрузка истории"><Skeleton style={{height:44}}/><Skeleton style={{height:320}}/></div>:<HistoryChart key={selected?.id??device} rows={selected?.history??[]}/>}
   </section>
  </div></>}
  {comparison&&<details className="analysis-period-comparison" open={comparisonOpen} onToggle={event=>setComparisonOpen(event.currentTarget.open)}><summary><span>Сравнение периодов MQ-135</span><ChevronDown size={18} strokeWidth={1.5} aria-hidden="true"/></summary>{comparisonOpen&&<Suspense fallback={<div className="analysis-comparison-loading" role="status" aria-label="Загрузка сравнения"><Skeleton style={{height:240}}/></div>}>{comparison(selected?.id||device||'Весь город')}</Suspense>}</details>}
  <p className="analysis-footnote">Сводка относится ко всей сети за выбранный период. Фильтр и поиск меняют список устройств; график показывает выделенное устройство. Периоды отсчитываются от последней записи в базе.</p>
 </div>
}
