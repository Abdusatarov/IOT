import {useEffect,useState,lazy,Suspense} from 'react'
import {Info} from 'lucide-react'
import AppShell,{AboutPage,PageSkeleton} from './components/AppShell'
import {Button,Notice} from './components/UI'
import {navigate,readPreference,savePreference,usePage,useAnalysisDevice} from './navigation'
import {useReadings} from './live'
import {useSnapshot} from './scopedReadings'
import Calendar from './LiveCalendar'
import {useMapPalette} from './mapPaletteState'

const Overview=lazy(()=>import('./Overview'))
const MapPage=lazy(()=>import('./MapPage'))
const AirChart=lazy(()=>import('./AirChart'))
const Analysis=lazy(()=>import('./Analysis'))
const visitKey='almatyair.hasVisited'

export default function App(){
 const page=usePage(),analysisDevice=useAnalysisDevice()
 const [dark,setDark]=useState(()=>readPreference('air-theme','light')==='dark')
 const [welcomeVisible,setWelcomeVisible]=useState(()=>readPreference(visitKey,'0')!=='1')
 const [district,setDistrict]=useState('Весь город'),[hour,setHour]=useState(24)
 useEffect(()=>{if(page==='overview'&&welcomeVisible)savePreference(visitKey,'1')},[page,welcomeVisible])
 const full=useReadings(page==='analytics')
 const snapshot=useSnapshot(page==='map'?hour:24,page!=='analytics'&&page!=='about')
 const rows=page==='analytics'?full.rows:snapshot.data?.measurements??[]
 const {error,loading,reload}=page==='analytics'?full:snapshot
 const palette=useMapPalette()
 const rawRange=rows.reduce(([min,max],row)=>row.mq135_raw===null?[min,max]:[Math.min(min,row.mq135_raw),Math.max(max,row.mq135_raw)],[Infinity,-Infinity])
 const [rawMin,rawMax]=snapshot.data?[snapshot.data.min,snapshot.data.max]:Number.isFinite(rawRange[0])?rawRange:[0,4095]
 const districts=snapshot.data?.devices??[...new Set(rows.map(r=>r.device_id))].sort()
 const scoped=rows.filter(r=>district==='Весь город'||r.device_id===district)
 const latest=[...new Map([...scoped].sort((a,b)=>Date.parse(b.measured_at)-Date.parse(a.measured_at)).map(r=>[r.device_id,r] as const).reverse()).values()]
 function theme(){setDark(!dark);savePreference('air-theme',!dark?'dark':'light')}
 const go=navigate
 return <AppShell page={page} onNavigate={go} dark={dark} onTheme={theme} welcome={page==='overview'&&welcomeVisible?<Notice onDismiss={()=>setWelcomeVisible(false)}><div className="shell-welcome-copy"><div><strong>Добро пожаловать в AlmatyAir</strong><p>Карта устройств, история измерений и анализ показаний. MQ-135 raw — исходный сигнал без калибровки.</p></div><Button variant="ghost" onClick={()=>{setWelcomeVisible(false);go('about')}}><Info size={16} strokeWidth={1.5} aria-hidden="true"/>О проекте</Button></div></Notice>:null}>
  <Suspense fallback={<PageSkeleton/>}>{page==='about'?<AboutPage onNavigate={go}/>:page==='overview'?<Overview rows={rows} latest={latest} devices={districts} district={district} onDevice={setDistrict} error={error} loading={loading} onRetry={reload} palette={palette.colors} min={rawMin} max={rawMax} onNavigate={go}/>:page==='map'?<MapPage snapshot={{end:snapshot.data?.end?Date.parse(snapshot.data.end):0,cutoff:snapshot.data?.cutoff?Date.parse(snapshot.data.cutoff):0}} rows={rows} devices={districts} district={district} onDevice={setDistrict} hour={hour} onHour={setHour} palette={palette} min={rawMin} max={rawMax} error={error} loading={loading} onRetry={reload} onAnalyze={id=>{setDistrict(id);window.location.hash=`/analytics?device=${encodeURIComponent(id)}`}}/>:
 page==='analytics'?<Analysis key={analysisDevice??'default'} rows={rows} initialDevice={analysisDevice??undefined} loading={loading} error={error} onRetry={reload} comparison={deviceId=><AirChart district={deviceId}/>}/>:
 <Calendar district={district} devices={districts} onDevice={setDistrict}/>}</Suspense>
 </AppShell>
}
