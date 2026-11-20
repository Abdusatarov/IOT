import {useEffect,useRef} from 'react'
import {MapContainer,TileLayer,CircleMarker,Tooltip,useMap,ZoomControl} from 'react-leaflet'
import L from 'leaflet'
import {useReadings,rawColor} from './live'
import type {Reading} from './live'
import {selectStations} from './mapData'
import {formatValue} from './time'
import 'leaflet/dist/leaflet.css'
import './map-base.css'

type PaletteProps={palette:string[];min:number;max:number}
function Layer({rows,palette,min,max}:{rows:Reading[]}&PaletteProps){const map=useMap();useEffect(()=>{const canvas=L.DomUtil.create('canvas');canvas.style.pointerEvents='none';canvas.style.position='absolute';const pane=map.getPane('raw')||map.createPane('raw');pane.style.zIndex='350';pane.appendChild(canvas);function draw(){const size=map.getSize();canvas.width=size.x;canvas.height=size.y;L.DomUtil.setPosition(canvas,map.containerPointToLayerPoint([0,0]));const ctx=canvas.getContext('2d')!;const points=rows.filter(r=>r.latitude!==null&&r.longitude!==null&&r.mq135_raw!==null).map(r=>({...map.latLngToContainerPoint([r.latitude!,r.longitude!]),v:r.mq135_raw!}));if(!points.length)return;for(let y=0;y<size.y;y+=14)for(let x=0;x<size.x;x+=14){const near=points.map(p=>({...p,d:(p.x-x)**2+(p.y-y)**2})).sort((a,b)=>a.d-b.d).slice(0,4);if(near[0].d>120**2)continue;let sum=0,w=0;near.forEach(p=>{const k=1/Math.max(p.d,25);sum+=k*p.v;w+=k});ctx.globalAlpha=.5;ctx.fillStyle=rawColor(sum/w,min,max,palette);ctx.fillRect(x,y,14,14)}}draw();map.on('moveend zoomend resize',draw);return()=>{map.off('moveend zoomend resize',draw);canvas.remove()}},[map,rows,palette,min,max]);return null}

function MapFocus({focus,panelOpen}:{focus?:Reading;panelOpen?:boolean}){
 const map=useMap()
 useEffect(()=>{
  const observer=new ResizeObserver(()=>map.invalidateSize({pan:false}))
  observer.observe(map.getContainer())
  return()=>observer.disconnect()
 },[map])
 useEffect(()=>{
  if(focus?.latitude===null||focus?.longitude===null||!focus)return
  const mobile=window.matchMedia('(max-width:767px)').matches
  map.panInside([focus.latitude,focus.longitude],{paddingTopLeft:L.point(24,180),paddingBottomRight:L.point(panelOpen&&!mobile?380:24,panelOpen&&mobile?Math.round(map.getSize().y*.55)+24:80)})
 },[map,focus,panelOpen])
 return null
}
function SensorMarker({reading,selected,palette,min,max,onSelect}:{reading:Reading;selected:boolean;onSelect?:(row:Reading)=>void}&PaletteProps){
 const ref=useRef<L.CircleMarker>(null)
 useEffect(()=>{
  const element=ref.current?.getElement()
  if(!element||!onSelect)return
  element.setAttribute('tabindex','0');element.setAttribute('role','button')
  element.setAttribute('aria-label',`Датчик ${reading.device_id}: ${formatValue(reading.mq135_raw)} raw`)
  element.setAttribute('aria-pressed',String(selected));element.setAttribute('data-device-id',reading.device_id)
  function key(event:KeyboardEvent){if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect?.(reading)}}
  function focus(){ref.current?.openTooltip()}
  function blur(){ref.current?.closeTooltip()}
  element.addEventListener('keydown',key);element.addEventListener('focus',focus);element.addEventListener('blur',blur)
  return()=>{element.removeEventListener('keydown',key);element.removeEventListener('focus',focus);element.removeEventListener('blur',blur)}
 },[reading,selected,onSelect])
 if(reading.latitude===null||reading.longitude===null)return null
 return <CircleMarker ref={ref} center={[reading.latitude,reading.longitude]} radius={8} bubblingMouseEvents={false} pathOptions={{color:'var(--map-marker-outline, white)',weight:selected?3:2,fillColor:rawColor(reading.mq135_raw,min,max,palette),fillOpacity:1,className:'sensor-marker'}} eventHandlers={{click:()=>onSelect?.(reading)}}>
  <Tooltip><strong>{reading.device_id}</strong><br/>{formatValue(reading.mq135_raw)} raw · {formatValue(reading.temperature_c)} °C · {formatValue(reading.humidity_pct)} %</Tooltip>
 </CircleMarker>
}
export function MapCanvas({stations,palette,min,max,heat=false,selected,onSelect,focus,panelOpen=false,compact=false}:{stations:Reading[];heat?:boolean;selected?:string;onSelect?:(row:Reading)=>void;focus?:Reading;panelOpen?:boolean;compact?:boolean}&PaletteProps){
 return <MapContainer center={[43.24,76.89]} zoom={12} zoomControl={false} className="air-map" aria-label="Карта измерений Алматы"><TileLayer attribution="© OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"/>{heat&&<Layer rows={stations} palette={palette} min={min} max={max}/>}<MapFocus focus={focus} panelOpen={panelOpen}/>{stations.filter(row=>row.latitude!==null&&row.longitude!==null).map(row=><SensorMarker key={row.device_id} reading={row} selected={selected===row.device_id} palette={palette} min={min} max={max} onSelect={onSelect}/>)}<ZoomControl position={compact?'topright':'bottomright'}/></MapContainer>
}
export default function AirMap({hour=24,district='Весь город',palette,min,max,compact=false,onSelect}:{compact?:boolean;hour?:number;district?:string;onSelect?:(row:Reading)=>void}&PaletteProps){
 const {rows}=useReadings()
 const {stations}=selectStations(rows,hour,district)
 return <MapCanvas stations={stations} palette={palette} min={min} max={max} compact={compact} onSelect={onSelect}/>
}
