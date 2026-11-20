import type {Reading} from './live'

// Preserve the original map's cutoff and latest-per-device selection.
export function selectStations(rows:Reading[],hour=24,district='Весь город'){
 const end=rows.length?Math.max(...rows.map(row=>Date.parse(row.measured_at))):0
 const cutoff=end-(24-hour)*3600000
 const unique=new Map<string,Reading>()
 ;[...rows].sort((a,b)=>Date.parse(b.measured_at)-Date.parse(a.measured_at)).forEach(row=>{
  if(Date.parse(row.measured_at)<=cutoff&&!unique.has(row.device_id)&&(district==='Весь город'||row.device_id===district))unique.set(row.device_id,row)
 })
 return {stations:[...unique.values()],cutoff,end}
}
