import {useEffect,useRef,useState} from 'react'
import type {ReactNode} from 'react'
import {Maximize2,Minimize2,X} from 'lucide-react'

export default function MapDrawer({title,onClose,children,footer}:{title:string;onClose:()=>void;children:ReactNode;footer?:ReactNode}){
 const [expanded,setExpanded]=useState(false)
 const close=useRef<HTMLButtonElement>(null),callback=useRef(onClose)
 useEffect(()=>{callback.current=onClose},[onClose])
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null
  close.current?.focus({preventScroll:true})
  function key(event:KeyboardEvent){if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();callback.current()}}
  document.addEventListener('keydown',key)
  return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true})}
 },[])
 return <section className={`map-drawer ${expanded?'is-expanded':''}`} role="dialog" aria-modal="false" aria-label={title}><div className="map-drawer-heading"><h2>{title}</h2><div className="map-drawer-actions"><button type="button" className="ui-button ui-button--ghost ui-icon-button map-drawer-expand" aria-label={expanded?'Свернуть нижнюю панель':'Развернуть нижнюю панель'} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?<Minimize2 size={18} strokeWidth={1.5}/>:<Maximize2 size={18} strokeWidth={1.5}/>}</button><button ref={close} className="ui-button ui-button--ghost ui-icon-button" type="button" aria-label="Закрыть панель" onClick={onClose}><X size={20} strokeWidth={1.5}/></button></div></div><div className="map-drawer-content">{children}</div>{footer&&<div className="map-drawer-footer">{footer}</div>}</section>
}
