export const districts = ['Наурызбайский','Бостандыкский','Медеуский','Ауэзовский','Алмалинский','Жетысуский','Турксибский','Алатауский']
export const districtValues=[48,36,35,29,26,26,19,16]
export const colors=['#98d84b','#ffd238','#ff873e','#ff5059','#a174b5','#9f697f']
export const stations=Array.from({length:84},(_,i)=>({id:i+1,lat:43.17+((i*37)%151)/1000,lng:76.77+((i*53)%241)/1000,aqi:i%11===0?52+i%9:16+i*7%34,district:districts[i%8]}))
export function concentration(aqi:number){return +(aqi*0.24).toFixed(1)}
