type Sample={device_id:string;measured_at:string;mq135_raw:number|null}
const DAY=86400000,HOUR=3600000
export function comparison(rows:Sample[],period:number,device='Весь город'){
 const scoped=rows.filter(r=>(device==='Весь город'||r.device_id===device)&&Number.isFinite(Date.parse(r.measured_at)))
 if(!scoped.length)return null
 const latest=Math.max(...scoped.map(r=>Date.parse(r.measured_at)))
 const lastDay=Math.floor(latest/DAY)*DAY
 const step=period===24?HOUR:DAY,count=period===24?24:period
 const start=period===24?lastDay:lastDay-(count-1)*DAY
 const duration=count*step
 const previous=start-duration
 const buckets=Array.from({length:count},()=>({current:[] as number[],previous:[] as number[]}))
 for(const r of scoped){if(r.mq135_raw===null||!Number.isFinite(r.mq135_raw))continue;const t=Date.parse(r.measured_at)
  if(t>=start&&t<start+duration)buckets[Math.floor((t-start)/step)].current.push(r.mq135_raw)
  else if(t>=previous&&t<start)buckets[Math.floor((t-previous)/step)].previous.push(r.mq135_raw)
 }
 const avg=(v:number[])=>v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length*10)/10:null
 return {start,previous,step,data:buckets.map((v,index)=>({index,current:avg(v.current),previous:avg(v.previous),currentCount:v.current.length,previousCount:v.previous.length}))}
}
