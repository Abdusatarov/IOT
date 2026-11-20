export type CalendarDay={date:string;count:number;avg:number|null;min:number|null;max:number|null}
const dayMs=86400000
export function calendarLayout(year:number){
 const start=Date.UTC(year,0,1),length=(Date.UTC(year+1,0,1)-start)/dayMs,offset=(new Date(start).getUTCDay()+6)%7
 return {offset,length,columns:Math.ceil((offset+length)/7),dates:Array.from({length},(_,i)=>new Date(start+i*dayMs).toISOString().slice(0,10))}
}
// Midrank keeps equal daily averages the same color; outliers do not flatten the scale.
export function calendarLevel(value:number|null,distribution:readonly number[]){
 if(value===null)return null
 if(distribution.length<2)return 2
 let lower=0,equal=0
 for(const average of distribution){if(average<value)lower++;else if(average===value)equal++}
 const rank=(lower+Math.max(0,equal-1)/2)/(distribution.length-1)
 return Math.min(4,Math.max(0,Math.floor(rank*5)))
}
export function calendarDate(value:string){return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'))}
