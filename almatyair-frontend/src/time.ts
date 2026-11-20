export const TIME_ZONE='Asia/Almaty'
export function formatDateTime(value:number|string){
 const time=typeof value==='number'?value:Date.parse(value)
 return Number.isFinite(time)?new Intl.DateTimeFormat('ru-RU',{timeZone:TIME_ZONE,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(time):'—'
}
export function chartTime(value:number,daily:boolean){return new Intl.DateTimeFormat('ru-RU',daily?{timeZone:TIME_ZONE,hour:'2-digit',minute:'2-digit',hour12:false}:{timeZone:TIME_ZONE,day:'2-digit',month:'2-digit'}).format(value)}
export function formatValue(value:number|null){return value===null||!Number.isFinite(value)?'—':value.toLocaleString('ru-RU',{maximumFractionDigits:1})}
