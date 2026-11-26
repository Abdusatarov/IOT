import {useCallback,useEffect,useState} from 'react'
export type Reading={measurement_id:string;device_id:string;latitude:number|null;longitude:number|null;mq135_raw:number|null;temperature_c:number|null;humidity_pct:number|null;gps_accuracy_m:number|null;measured_at:string;is_synthetic?:boolean;altitude_m?:number|null;hour_start?:string|null;sample_count?:number|null;gps_sample_at?:string|null}
let readers=0
let cache:{promise:Promise<Reading[]>;controller:AbortController}|null=null
function fullHistory(){
 if(cache)return cache.promise
 const controller=new AbortController()
 const promise=(async()=>{const all:Reading[]=[];for(let offset=0;;offset+=1000){const response=await fetch(`/api/v1/measurements?limit=1000&offset=${offset}`,{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();all.push(...data.measurements);if(all.length>=data.total||!data.measurements.length)return all}})()
 cache={promise,controller}
 promise.catch(()=>{if(cache?.promise===promise)cache=null})
 return promise
}
export function useReadings(enabled=true){
 const [rows,setRows]=useState<Reading[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retryVersion,setRetryVersion]=useState(0)
 const reload=useCallback(()=>{cache?.controller.abort();cache=null;setRetryVersion(value=>value+1)},[])
 useEffect(()=>{
  if(!enabled)return
  readers++;let active=true
  async function load(){setLoading(true);try{const result=await fullHistory();if(active){setRows(result);setError('')}}catch(reason){if(active&&!(reason instanceof DOMException&&reason.name==='AbortError'))setError(String(reason))}finally{if(active)setLoading(false)}}
  load();const timer=setInterval(()=>{cache=null;load()},60000)
  return()=>{active=false;clearInterval(timer);readers--;if(!readers){cache?.controller.abort();cache=null}}
 },[retryVersion,enabled])
 return {rows,error,loading,reload}
}
export function average(values:(number|null)[]){const v=values.filter((n):n is number=>n!==null);return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length*10)/10:null}
export const rawColors=['#f5dcba','#e9b47d','#ce8854','#ae5c36','#833c24','#532516']
export function rawColor(value:number|null,min=0,max=4095,colors=rawColors){return value===null?'#a0a9b8':colors[Math.min(colors.length-1,Math.max(0,Math.floor((value-min)/(max-min||1)*colors.length)))]}
