export type HistoryPoint={time:number;value:number|null;gap?:true}
// Presentation only: break the SVG line without changing stored measurements.
export function withHistoryGaps(points:HistoryPoint[]):HistoryPoint[]{
 const result:HistoryPoint[]=[]
 for(const point of points){const previous=result[result.length-1];if(previous&&point.time-previous.time>6*3600000)result.push({time:(previous.time+point.time)/2,value:null,gap:true});result.push(point)}
 return result
}
