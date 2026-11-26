import {useState} from 'react'
import {Pause,Play} from 'lucide-react'
import './AirMascot.css'

type Props={value:number|null;low:number;high:number;pending:boolean}
export default function AirMascot({value,low,high,pending}:Props){
 const [paused,setPaused]=useState(false)
 const missing=pending||value===null||!Number.isFinite(value)
 const position=!missing&&high>low?(value-low)/(high-low):.5
 const mood=missing?'waiting':position<.34?'smile':position>.66?'thoughtful':'calm'
 const label=missing?'Нет данных за выбранный день':mood==='smile'?'Raw ближе к нижней границе недели':mood==='thoughtful'?'Raw ближе к верхней границе недели':'Raw в середине недельного диапазона'
 const mouth=mood==='smile'?'M45 72 Q60 87 75 72':mood==='thoughtful'?'M47 80 Q60 70 73 80':'M49 77 Q60 79 71 77'
 return <div className={`air-mascot ${paused?'is-paused':''}`} data-mood={mood}>
  <svg viewBox="0 0 120 132" role="img" aria-label={`Персонаж AlmatyAir. ${label}. Условная эмоция, не оценка безопасности.`}>
   <ellipse className="air-mascot-shadow" cx="60" cy="122" rx="28" ry="5"/>
   <g className="air-mascot-float"><path className="air-mascot-body" d="M60 9C45 25 20 46 20 73a40 40 0 0 0 80 0C100 46 75 25 60 9Z"/>
    <path className="air-mascot-shine" d="M40 44q-11 13-11 28"/>
    <g className="air-mascot-eyes">{missing?<><path d="M38 60h10M72 60h10"/><path d="M57 79h6"/></>:<><ellipse cx="43" cy="60" rx="4" ry="5"/><ellipse cx="77" cy="60" rx="4" ry="5"/></>}</g>
    {!missing&&<path className="air-mascot-mouth" d={mouth}/>}
    {mood==='thoughtful'&&<g className="air-mascot-brows"><path d="m37 48 12 3M71 51l12-3"/></g>}
    {mood==='smile'&&<g className="air-mascot-cheeks"><ellipse cx="34" cy="73" rx="6" ry="3"/><ellipse cx="86" cy="73" rx="6" ry="3"/></g>}
   </g>
  </svg>
  <button type="button" className="air-mascot-toggle" onClick={()=>setPaused(v=>!v)} aria-label={paused?'Включить анимацию персонажа':'Остановить анимацию персонажа'} title={paused?'Включить анимацию':'Остановить анимацию'}>{paused?<Play size={12} aria-hidden="true"/>:<Pause size={12} aria-hidden="true"/>}</button>
 </div>
}
