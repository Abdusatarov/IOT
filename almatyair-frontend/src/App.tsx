import {useEffect,useState,lazy,Suspense} from 'react'
const AirMap=lazy(()=>import('./AirMap'))
const AirChart=lazy(()=>import('./AirChart'))
const Analysis=lazy(()=>import('./Analysis'))
import {useReadings,average,rawColors as colors} from './live'
import Calendar from './LiveCalendar'
import MapPalette from './MapPalette'
import {useMapPalette} from './mapPaletteState'
import './App.css'
import './integration.css'
type Page='home'|'overview'|'map'|'analytics'|'calendar'
const visitKey='almatyair.hasVisited'
function initialPage(): Page {
 try {
  return localStorage.getItem(visitKey)==='1' ? 'overview' : 'home'
 } catch {
  return 'home'
 }
}
function Logo(){return <span className="logo" aria-hidden="true"><i/><i/><i/></span>}
export default function App(){
 const [page,setPage]=useState<Page>(initialPage),[dark,setDark]=useState(()=>localStorage.getItem('air-theme')==='dark'),[unit,setUnit]=useState(false),[menu,setMenu]=useState(false),[district,setDistrict]=useState('Весь город'),[hour,setHour]=useState(24)
 useEffect(()=>{
  try { localStorage.setItem(visitKey,'1') } catch { /* Storage may be disabled. */ }
 },[])
 const {rows,error}=useReadings()
 const palette=useMapPalette()
 const rawRange=rows.reduce(([min,max],row)=>row.mq135_raw===null?[min,max]:[Math.min(min,row.mq135_raw),Math.max(max,row.mq135_raw)],[Infinity,-Infinity])
 const [rawMin,rawMax]=Number.isFinite(rawRange[0])?rawRange:[0,4095]
 const districts=[...new Set(rows.map(r=>r.device_id))].sort()
 const scoped=rows.filter(r=>district==='Весь город'||r.device_id===district)
 const latest=[...new Map([...scoped].sort((a,b)=>Date.parse(b.measured_at)-Date.parse(a.measured_at)).map(r=>[r.device_id,r] as const).reverse()).values()]
 const districtValues=districts.map(id=>rows.find(r=>r.device_id===id)?.mq135_raw??0)
 const aqi=average(latest.map(r=>r.mq135_raw))??0
 const temperature=average(latest.map(r=>r.temperature_c))
 const humidity=average(latest.map(r=>r.humidity_pct))
 function theme(){setDark(!dark);localStorage.setItem('air-theme',!dark?'dark':'light')}
 function go(p:Page){setPage(p);setMenu(false);window.scrollTo({top:0})}
 return <Suspense fallback={<div style={{padding:40}}>Загрузка интерфейса…</div>}><div className={'app '+(dark?'dark':'')}><header><div className="header-inner"><button className="brand" onClick={()=>go('home')}><Logo/><strong>AlmatyAir</strong><span>бета версия</span></button><nav aria-label="Основная навигация"><button className={page==='overview'?'active':''} onClick={()=>go('overview')}>⌂ <span>Обзор</span></button><button className={page==='map'?'active':''} onClick={()=>go('map')}>♧ <span>Карта</span></button><button className={page==='analytics'?'active':''} onClick={()=>go('analytics')}>Анализ</button><div className="dropdown"><button aria-expanded={menu} className={page==='calendar'?'active':''} onClick={()=>setMenu(!menu)}>Подробнее⌄</button>{menu&&<div className="dropdown-menu"><button onClick={()=>go('calendar')}>Календарь MQ-135</button><button onClick={()=>go('home')}>О проекте</button></div>}</div></nav><div className="header-tools"><div className="unit-switch"><button className={!unit?'selected':''} onClick={()=>setUnit(false)}>MQ-135</button><button className={unit?'selected':''} onClick={()=>setUnit(true)}>raw</button></div><button className="theme" aria-label="Переключить тему" onClick={theme}>{dark?'☾':'☼'}</button><span className="location">♧ Алматы</span><span className="language">◎ Русский</span></div></div></header>
 {page==='home'?<><section className="hero"><div className="cloud cloud-one"/><div className="cloud cloud-two"/><div className="hero-content"><p>ALMATY AIR INITIATIVE</p><h1>Чистый воздух.<br/>Понятные данные.<br/>Наш Алматы.</h1><p className="hero-description">Следите за качеством воздуха в каждом районе города.</p><button onClick={()=>go('overview')}>Узнать качество воздуха ↗</button></div></section><section className="container intro"><h2>Город, которым хочется дышать</h2><p>AlmatyAir объединяет карту датчиков, историю измерений и аналитику в одном интерфейсе. Показания загружаются из backend; импортированная синтетика сохраняется в истории.</p><button className="primary" onClick={()=>go('map')}>Открыть карту</button></section></>:
 page==='map'?<section className="full-map"><AirMap palette={palette.colors} min={rawMin} max={rawMax} key="full" unit={unit} hour={hour} district={district} deviceControl={<label>Устройство<select value={district} onChange={e=>setDistrict(e.target.value)}><option>Весь город</option>{districts.map(d=><option key={d}>{d}</option>)}</select></label>}/><div className="map-timeline card"><MapPalette palette={palette} min={rawMin} max={rawMax}/><div className="card-heading"><span>● История · {unit?'MQ-135 raw, мкг/м³':'raw'}</span><strong>{hour===24?'Последняя запись':(24-hour)+' ч до последней'}</strong></div><input aria-label="Час измерений" type="range" min="0" max="24" value={hour} onChange={e=>setHour(+e.target.value)}/><div className="card-heading muted"><small>24 ч до последней записи</small><small>Последняя запись</small></div></div></section>:
 <main className="container"><div className="page-heading"><div><p className="eyebrow">МОНИТОРИНГ ВОЗДУХА</p><h1>{page==='overview'?'Воздух в Алматы':page==='analytics'?'Анализ':'Календарь качества воздуха'}</h1></div><span className="demo-badge">● Backend · {rows.length} измерений</span></div>{page!=='analytics'&&<><section className="districts card">{districts.map((d,i)=><button key={d} onClick={()=>setDistrict(d===district?'Весь город':d)} className={district===d?'district chosen':'district'}><span>☻ {d}</span><strong>{unit?(districtValues[i]):districtValues[i]} <small>{unit?'raw':'raw'}</small></strong></button>)}</section><div className="selection"><span>{district}</span>{district!=='Весь город'&&<button onClick={()=>setDistrict('Весь город')}>Сбросить ×</button>}</div></>}
 {page==='overview'?<><div className="summary-grid"><section className="card gauge-card"><div className="card-heading"><h2>MQ-135 raw</h2><span className="muted" title="Исходный сигнал MQ-135">ⓘ</span></div><div className="gauge"><svg viewBox="0 0 240 140" role="img" aria-label={'Исходный сигнал MQ-135 '+aqi}>{colors.map((c,i)=>{const a=Math.PI+i*Math.PI/6,b=a+Math.PI/6-.045;return <path key={c} d={'M '+(120+88*Math.cos(a))+' '+(115+88*Math.sin(a))+' A 88 88 0 0 1 '+(120+88*Math.cos(b))+' '+(115+88*Math.sin(b))} fill="none" stroke={c} strokeWidth="22" strokeLinecap="round"/>})}<g transform={'rotate('+(-75+Math.min(1,aqi/4095)*150)+' 120 115)'}><path d="M 114 115 L 120 48 L 126 115 Z" fill="var(--text)"/><circle cx="120" cy="115" r="7" fill="var(--text)"/></g></svg><strong>{unit?(aqi):aqi} <small>{unit?'raw':'raw'}</small></strong><span className="good-tag">Сигнал датчиков</span></div></section><section className="card weather"><div className="card-heading"><h2>☀ Температура и влажность</h2><strong className="temperature">{temperature??'—'}°</strong></div><div className="card-heading muted"><span>Последние измерения устройств</span></div><div className="weather-grid">{[['♧','Влажность',String(humidity??'—')+'%'],['≋','Ветер','Нет датчика'],['◴','Давление','Нет датчика'],['◎','Видимость','Нет датчика']].map(([icon,label,v])=><div key={label}><span>{icon}</span><p><small>{label}</small><strong>{v}</strong></p></div>)}</div><small className="muted weather-note">По датчикам AM2301A</small></section><section className="card service"><span>✿</span><h2>Датчик пыльцы не подключён</h2><p className="muted">Данные появятся после подключения сервиса</p></section></div><div className="overview-grid"><section className="card map-card"><div className="card-heading"><h2>Карта качества воздуха</h2><span className="muted">Алматы</span></div><div className="mini-map"><AirMap palette={palette.colors} min={rawMin} max={rawMax} key="mini" unit={unit} district={district}/><button className="open-map" onClick={()=>go('map')}>Открыть карту ↗</button></div></section><div className="right-column"><AirChart unit={unit} district={district}/><section className="card insight"><span>◎</span><div><strong>Наблюдайте за изменениями</strong><p>Сравнивайте показатели за день, неделю и месяц.</p></div></section><section className="card recommendation"><span>☻</span><div><h2>MQ-135 без калибровки</h2><p>MQ-135 raw не является AQI или концентрацией газа.</p><small>Для решений используйте актуальные проверенные измерения.</small></div></section></div></div><button className="calendar-link" onClick={()=>go('calendar')}>Посмотреть календарь качества воздуха →</button></>:
 page==='calendar'?<Calendar district={district}/>:<><Analysis rows={rows}/><details className="card analysis-comparison"><summary>Сравнение периодов MQ-135</summary><AirChart district={district}/></details></>}
 <footer><strong>AlmatyAir</strong><span>Дышать свободнее — знать больше.</span><small>MQ-135 raw · без калибровки · {error}</small></footer></main>}</div></Suspense>
}
