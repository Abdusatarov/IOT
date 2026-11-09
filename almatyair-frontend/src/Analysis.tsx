import {useMemo,useRef,useState} from 'react'
import {CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts'
import {average} from './live'
import type {Reading} from './live'

const metrics = {
  mq135_raw: {label: 'MQ-135', unit: 'raw'},
  temperature_c: {label: 'Температура', unit: '°C'},
  humidity_pct: {label: 'Влажность', unit: '%'},
  gps_accuracy_m: {label: 'Точность GPS', unit: 'м'},
}
type Metric = keyof typeof metrics
const hour = 3600000
const dateLabel = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})
const fmt = (value: number | null) => value === null ? '—' : value.toLocaleString('ru-RU', {maximumFractionDigits: 1})

function History({rows}: {rows: Reading[]}) {
  const [metric, setMetric] = useState<Metric>('mq135_raw')
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState(1)
  const drag = useRef<{x: number; position: number} | null>(null)
  const points = useMemo(() => rows.map(row => ({time: Date.parse(row.measured_at), value: row[metric]})), [rows, metric])
  if (!points.length) return <p className="muted">Нет измерений в выбранном периоде.</p>
  const first = points[0].time
  const last = Math.max(first + 1, points[points.length - 1].time)
  const span = last - first
  const width = Math.max(Math.min(span, hour), span / zoom)
  const travel = span - width
  const left = first + travel * position
  const right = left + width
  const shown = points.filter(point => point.time >= left && point.time <= right)
  const {label, unit} = metrics[metric]
  function changeZoom(factor: number) {
    setZoom(current => Math.max(1, Math.min(Math.max(1, span / hour), current * factor)))
  }
  return <>
    <div className="analysis-controls">
      {Object.entries(metrics).map(([key, item]) => <button type="button" key={key}
        aria-pressed={metric === key} onClick={() => setMetric(key as Metric)}>{item.label}</button>)}
    </div>
    <div className="analysis-controls">
      <button type="button" aria-label="Приблизить" onClick={() => changeZoom(2)}>+</button>
      <button type="button" aria-label="Отдалить" onClick={() => changeZoom(.5)}>−</button>
      <button type="button" onClick={() => {setZoom(1); setPosition(1)}}>Весь период</button>
      <span>{dateLabel.format(left)} — {dateLabel.format(right)}</span>
    </div>
    <div className="analysis-plot" onPointerDown={event => {
      if (event.button !== 0 || travel <= 0) return
      drag.current = {x: event.clientX, position}
      event.currentTarget.setPointerCapture(event.pointerId)
    }} onPointerMove={event => {
      if (!drag.current || travel <= 0) return
      const offset = (event.clientX - drag.current.x) / event.currentTarget.clientWidth * width / travel
      setPosition(Math.max(0, Math.min(1, drag.current.position - offset)))
    }} onLostPointerCapture={() => {drag.current = null}}>
      {shown.some(point => point.value !== null) ?
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={shown}>
            <CartesianGrid stroke="var(--line)" />
            <XAxis type="number" dataKey="time" domain={[left, right]} tickFormatter={time => dateLabel.format(time)}
              minTickGap={45} tick={{fontSize: 11}} />
            <YAxis domain={['auto', 'auto']} tick={{fontSize: 11}} />
            <Tooltip labelFormatter={time => dateLabel.format(Number(time))}
              formatter={value => [`${value} ${unit}`, label]}
              contentStyle={{background: 'var(--card)', borderColor: 'var(--line)'}} />
            <Line dataKey="value" name={label} stroke="#347efa" strokeWidth={2}
              dot={shown.length < 80} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer> : <p className="muted">Нет значений этого показателя на выбранном участке.</p>}
    </div>
    <label className="analysis-position">Положение на шкале времени
      <input type="range" min="0" max="1000" value={Math.round(position * 1000)} disabled={travel <= 0}
        onChange={event => setPosition(Number(event.target.value) / 1000)} />
    </label>
    <small className="muted">Приблизь график, затем перетащи его или сдвинь ползунок. Время Алматы.</small>
  </>
}

export default function Analysis({rows}: {rows: Reading[]}) {
  const [period, setPeriod] = useState(720)
  const [search, setSearch] = useState('')
  const [device, setDevice] = useState('')
  const chart = useRef<HTMLElement>(null)
  const {groups, count} = useMemo(() => {
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
  }, [rows, period])
  const selected = groups.find(group => group.id === device) ?? groups[0]
  const shown = groups.filter(group => group.id.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const latest = groups.map(group => group.latest)
  return <div className="analysis-layout">
    <section className="card analytics-banner">
      <div><h2>Анализ сети датчиков</h2><p>Сводка по последним показаниям устройств</p></div>
      <label>Период<select value={period} onChange={event => setPeriod(Number(event.target.value))}>
        <option value={24}>24 часа</option><option value={168}>7 дней</option>
        <option value={720}>30 дней</option><option value={0}>Вся история</option>
      </select></label>
    </section>
    <div className="metrics">
      {[
        ['Датчики', groups.length, 'В выбранном периоде'],
        ['Измерения', count, 'От последней записи в базе'],
        ['Температура', fmt(average(latest.map(row => row.temperature_c))), '°C'],
        ['Влажность', fmt(average(latest.map(row => row.humidity_pct))), '%'],
        ['MQ-135', fmt(average(latest.map(row => row.mq135_raw))), 'raw'],
      ].map(([label,value,unit]) => <section className="card metric" key={label}>
        <p>{label}</p><strong>{value.toLocaleString('ru-RU')}</strong><small>{unit}</small>
      </section>)}
    </div>
    <section className="card chart-card" ref={chart}>
      <div className="card-heading"><h2>История датчика</h2>
        <select aria-label="Датчик для графика" value={selected?.id ?? ''} disabled={!selected}
          onChange={event => setDevice(event.target.value)}>
          {groups.map(group => <option key={group.id}>{group.id}</option>)}
        </select>
      </div>
      <History key={`${selected?.id}:${period}`} rows={selected?.history ?? []} />
    </section>
    <section className="card">
      <div className="card-heading"><h2>Список датчиков</h2>
        <input className="analysis-search" type="search" aria-label="Поиск по датчикам"
          placeholder="Например, ESP32-001" value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      <div className="analysis-table-wrap"><table className="analysis-table">
        <thead><tr><th>Датчик</th><th>Последнее измерение</th><th>°C</th><th>Влажность</th>
          <th>MQ-135 raw</th><th>Δ raw</th><th>Записей</th></tr></thead>
        <tbody>{shown.map(({id, history, latest, delta}) => <tr key={id}>
          <td><button type="button" aria-pressed={selected?.id === id} onClick={() => {
            setDevice(id)
            chart.current?.scrollIntoView({block: 'nearest'})
          }}>{id}</button></td>
          <td>{dateLabel.format(Date.parse(latest.measured_at))}</td>
          <td>{fmt(latest.temperature_c)}</td><td>{fmt(latest.humidity_pct)}</td>
          <td>{fmt(latest.mq135_raw)}</td><td>{delta !== null && delta > 0 ? '+' : ''}{fmt(delta)}</td>
          <td>{history.length}</td>
        </tr>)}</tbody>
      </table></div>
      {!shown.length && <p className="muted">{groups.length ? 'Датчики по этому запросу не найдены.' : 'Нет измерений.'}</p>}
      <small className="muted">Δ raw — разница между первым и последним доступными значениями за период.</small>
    </section>
  </div>
}
