import type {Reading} from './live'
const hour=3600000

export function analysisGroups(rows:Reading[],period:number){
    const timed = rows.map(row => ({row, time: Date.parse(row.measured_at)})).filter(item => Number.isFinite(item.time))
    const end = timed.reduce((max, item) => Math.max(max, item.time), -Infinity)
    const byDevice = new Map<string, typeof timed>()
    let count = 0
    for (const item of timed) {
      if (period && item.time <= end - period * hour) continue
      const id = item.row.device_id
      if (!byDevice.has(id)) byDevice.set(id, [])
      byDevice.get(id)!.push(item)
      count++
    }
    const groups = [...byDevice].sort(([a], [b]) => a.localeCompare(b)).map(([id, readings]) => {
      const history = readings.sort((a,b) => a.time - b.time).map(item => item.row)
      const raw = history.map(row => row.mq135_raw).filter(value => value !== null)
      return {id, history, latest: history[history.length - 1], delta: raw.length >= 2 ? raw[raw.length - 1] - raw[0] : null}
    })
    return {groups, count}
}
