import {useState} from 'react'
import {Button,Card,DeviceCombobox,EmptyState,ErrorState,Notice,SegmentedControl,Skeleton} from './components/UI'

export default function DesignPreview(){
 const [dark,setDark]=useState(false),[period,setPeriod]=useState('24'),[device,setDevice]=useState('Весь город'),[notice,setNotice]=useState(true),[retried,setRetried]=useState(false)
 return <div className={`app design-preview ${dark?'dark':''}`}><div className="design-preview-inner">
  <header className="design-preview-header"><div className="design-preview-brand"><span className="design-preview-mark" aria-hidden="true"><svg className="ui-icon" viewBox="0 0 24 24"><path d="M4 17v-4m5 4V7m5 10v-7m5 7V4"/></svg></span><div>AlmatyAir<small>Мониторинг показаний датчиков</small></div></div><Button aria-pressed={dark} onClick={()=>setDark(!dark)}>{dark?'Светлая тема':'Тёмная тема'}</Button></header>
  <div className="design-preview-title"><span>01 / ОСНОВА ИНТЕРФЕЙСА</span><h1>Данные на первом месте.</h1><p>Спокойная типографика, ясные состояния и единые элементы управления. Предпросмотр первого этапа редизайна.</p></div>
  {notice&&<Notice onDismiss={()=>setNotice(false)}>MQ-135 показывает исходный сигнал без калибровки. Это не AQI и не концентрация газа.</Notice>}
  <div className="design-preview-grid">
   <Card className="design-preview-wide"><h2>Показания датчиков</h2><p className="design-preview-caption">Пример оформления значений. Демонстрационные числа, не текущие измерения.</p><div className="design-preview-values">
    <div><span className="ui-label">MQ-135</span><div className="ui-number">62<small>raw</small></div><p>Исходный сигнал датчика</p></div>
    <div><span className="ui-label">Температура</span><div className="ui-number">27.9<small>°C</small></div><p>Датчик AM2301A</p></div>
    <div><span className="ui-label">Влажность</span><div className="ui-number">33.4<small>%</small></div><p>Относительная влажность</p></div>
   </div></Card>
   <Card><h2>Выбор данных</h2><p className="design-preview-caption">Один поиск устройств для всех страниц</p><div className="design-preview-stack"><DeviceCombobox devices={['ESP32-001','ESP32-002','ESP32-003','ESP32-004']} value={device} onChange={setDevice}/><div><p className="ui-label">Период</p><SegmentedControl label="Период измерений" value={period} onChange={setPeriod} options={[{value:'24',label:'24 ч'},{value:'7',label:'7 д'},{value:'30',label:'30 д'}]}/></div><p className="ui-label" role="status">Выбрано: {device}</p></div></Card>
   <Card><h2>Действия</h2><p className="design-preview-caption">Кнопки с областью нажатия от 44 px</p><div className="design-preview-stack"><div className="design-preview-controls"><Button variant="primary">Открыть карту</Button><Button>Подробнее</Button><Button variant="ghost">Сбросить</Button></div><div className="design-preview-controls"><Button disabled>Нет данных</Button><Button variant="danger">Удалить выбор</Button></div><Notice kind="warning">Нет свежих GPS-координат. Показания сохранены без местоположения.</Notice></div></Card>
   <Card><h2>Загрузка</h2><p className="design-preview-caption">Скелетон сохраняет структуру страницы</p><div className="design-preview-skeletons" role="status" aria-label="Загрузка измерений"><Skeleton style={{width:'35%',height:40}}/><Skeleton style={{width:'70%'}}/><Skeleton style={{height:56}}/></div></Card>
   <Card><h2>Нет данных</h2><p className="design-preview-caption">Пропуски не заменяются нулями</p><EmptyState/></Card>
   <Card className="design-preview-wide"><h2>Ошибка соединения</h2><p className="design-preview-caption">Понятное сообщение и доступное повторное действие</p>{retried?<Notice>Повторная попытка выбрана. В этом предпросмотре запросы к серверу не выполняются.</Notice>:<ErrorState onRetry={()=>setRetried(true)}/>}</Card>
  </div><footer className="design-preview-footer"><span>Inter · JetBrains Mono · единая система размеров и цветов</span><a href="/">Вернуться к текущему сайту</a></footer>
 </div></div>
}
