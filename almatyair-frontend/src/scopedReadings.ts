import {useEffect,useState} from 'react'
import type {Reading} from './live'
export type Snapshot={end:string|null;cutoff:string|null;total:number;devices:string[];min:number;max:number;measurements:Reading[]}
function useRequest<T>(key:string|null,load:(signal:AbortSignal)=>Promise<T>){
 const [state,setState]=useState<{key:string;data:T}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[retry,setRetry]=useState(0)
 useEffect(()=>{
  if(!key)return
  const controller=new AbortController();let active=true
  async function run(){setBusy(true);try{const data=await load(controller.signal);if(active){setState({key:key!,data});setError('')}}catch(reason){if(active&&!controller.signal.aborted)setError(String(reason))}finally{if(active)setBusy(false)}}
  run();const timer=setInterval(run,60000)
  return()=>{active=false;controller.abort();clearInterval(timer)}
  // The request key includes every input; inline loader identity must not restart it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,retry])
 return {data:state?.key===key?state.data:null,error:key?error:'',loading:!!key&&(busy||state?.key!==key&&!error),reload:()=>setRetry(value=>value+1)}
}
export function useSnapshot(hour:number,enabled=true){const key=enabled?`/api/v1/dashboard/snapshot?hour=${hour}`:null;return useRequest<Snapshot>(key,async signal=>{const response=await fetch(key!,{signal});if(!response.ok)throw Error('HTTP '+response.status);return response.json()})}
export function useWindowReadings(from:number|null,to:number|null,device='Весь город',enabled=true){
 const q=new URLSearchParams();if(from!==null)q.set('from',new Date(from).toISOString());if(to!==null)q.set('to',new Date(to).toISOString());if(device!=='Весь город')q.set('device_id',device)
 const key=enabled&&from!==null&&to!==null?'/api/v1/measurements?'+q:null
 const result=useRequest<Reading[]>(key,async signal=>{const rows:Reading[]=[];for(let offset=0;;offset+=1000){const response=await fetch(`${key}&limit=1000&offset=${offset}`,{signal});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();rows.push(...data.measurements);if(rows.length>=data.total||!data.measurements.length)return rows}})
 return {rows:result.data??[],error:result.error,loading:result.loading,reload:result.reload}
}
export function mergeReadings(...groups:Reading[][]){return [...new Map(groups.flat().map(row=>[row.measurement_id,row])).values()]}
