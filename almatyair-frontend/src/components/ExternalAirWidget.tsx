import {useEffect,useRef,useState} from 'react'
import {ExternalLink} from 'lucide-react'
import {Card} from './UI'

const origin='https://airwidget.air.org.kz'
export default function ExternalAirWidget(){
 const frame=useRef<HTMLIFrameElement>(null)
 const [height,setHeight]=useState(340)
 useEffect(()=>{
  function resize(event:MessageEvent){
   if(event.origin!==origin||!frame.current||event.source!==frame.current.contentWindow)return
   const data=event.data
   if(!data||data.type!=='ALMATY_AIR_WIDGET_HEIGHT'||typeof data.height!=='number'||!Number.isFinite(data.height))return
   setHeight(Math.min(1400,Math.max(180,Math.ceil(data.height))))
  }
  window.addEventListener('message',resize)
  return ()=>window.removeEventListener('message',resize)
 },[])
 return <Card className="external-air-widget" aria-labelledby="external-air-title">
  <div className="external-air-heading"><div><p className="overview-eyebrow">ВНЕШНИЙ ИСТОЧНИК</p><h2 id="external-air-title">Качество воздуха в Алматы</h2><p>Виджет Almaty Air Initiative · AQI по данным источника</p></div><a href={`${origin}/adaptive-widget`} target="_blank" rel="noopener noreferrer">Открыть источник<ExternalLink size={15} aria-hidden="true"/></a></div>
  <div className="external-air-frame"><iframe ref={frame} src={`${origin}/adaptive-widget`} title="Качество воздуха в Алматы — Almaty Air Initiative" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" style={{height}}/></div>
  <p className="external-air-note">Это отдельные данные Almaty Air Initiative, а не расчёт по нашим датчикам MQ-135. Виджет обновляется на стороне источника. Если он не отображается, откройте источник по ссылке выше.</p>
 </Card>
}
