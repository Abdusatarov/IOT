import {useEffect,useRef,useState} from 'react'
import type {ReactNode} from 'react'
import {Activity,ArrowUpRight,CalendarDays,ChartNoAxesCombined,Info,LayoutDashboard,Map,MapPin,Menu,Moon,Pin,PinOff,Sun,X} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'
import type {Page} from '../navigation'
import {readPreference,savePreference} from '../navigation'
import {Button,Card,Skeleton} from './UI'
import TypewriterHeading from './TypewriterHeading'

const items:{page:Page;label:string;icon:LucideIcon}[]=[
 {page:'overview',label:'Обзор',icon:LayoutDashboard},
 {page:'map',label:'Карта',icon:Map},
 {page:'analytics',label:'Анализ',icon:ChartNoAxesCombined},
 {page:'calendar',label:'Календарь',icon:CalendarDays},
 {page:'about',label:'О проекте',icon:Info},
]
type NavigationProps={page:Page;onNavigate:(page:Page)=>void}
function NavigationLink({item,page,onNavigate,compact=false}:{item:typeof items[number];compact?:boolean}&NavigationProps){
 const Icon=item.icon
 return <a href={`#/${item.page}`} className="shell-nav-link" aria-label={item.label} aria-current={page===item.page?'page':undefined} title={compact?item.label:undefined} onClick={event=>{if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onNavigate(item.page)}}}><Icon size={20} strokeWidth={1.5} aria-hidden="true"/><span className="shell-nav-label">{item.label}</span></a>
}
export default function AppShell({page,onNavigate,dark,onTheme,welcome,children}:{dark:boolean;onTheme:()=>void;welcome?:ReactNode;children:ReactNode}&NavigationProps){
 const [pinned,setPinned]=useState(()=>readPreference('almatyair.sidebarPinned','0')==='1')
 const [expanded,setExpanded]=useState(false),[mobileOpen,setMobileOpen]=useState(false)
 const sidebar=useRef<HTMLElement>(null),burger=useRef<HTMLButtonElement>(null),mounted=useRef(false),pointerInside=useRef(false),closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const open=pinned||expanded
 function cancelClose(){if(closeTimer.current!==null){clearTimeout(closeTimer.current);closeTimer.current=null}}
 function reveal(){cancelClose();setExpanded(true)}
 function scheduleClose(){cancelClose();closeTimer.current=setTimeout(()=>{if(!pointerInside.current&&!sidebar.current?.querySelector(':focus-visible'))setExpanded(false)},200)}
 function closeMobile(){setMobileOpen(false)}
 useEffect(()=>()=>{if(closeTimer.current!==null)clearTimeout(closeTimer.current)},[])
 useEffect(()=>{const media=window.matchMedia('(min-width:768px)');function resize(){setMobileOpen(false);setExpanded(false)}media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize)},[])
 useEffect(()=>{
  if(!mobileOpen)return
  const previousOverflow=document.body.style.overflow,menuTrigger=burger.current
  document.body.style.overflow='hidden'
  sidebar.current?.querySelector<HTMLAnchorElement>('nav a')?.focus()
  function key(event:KeyboardEvent){
   if(event.key==='Escape'){event.preventDefault();setMobileOpen(false)}
   if(event.key==='Tab'){
    const controls=Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')??[]).filter(node=>node.getClientRects().length)
    const first=controls[0],last=controls[controls.length-1]
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
   }
  }
  document.addEventListener('keydown',key)
  return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',key);if(menuTrigger?.getClientRects().length)menuTrigger.focus({preventScroll:true});else document.getElementById('main-content')?.focus({preventScroll:true})}
 },[mobileOpen])
 const title=items.find(item=>item.page===page)!.label
 useEffect(()=>{
  document.title=`${title} · AlmatyAir`
  window.scrollTo({top:0})
  if(mounted.current)document.getElementById('main-content')?.focus({preventScroll:true})
  mounted.current=true
 },[page,title])
 function go(next:Page){setMobileOpen(false);setExpanded(false);if(next===page)document.getElementById('main-content')?.focus({preventScroll:true});onNavigate(next)}
 function pin(){setPinned(!pinned);savePreference('almatyair.sidebarPinned',pinned?'0':'1')}
 return <div className={`app app-shell ${dark?'dark':''} ${pinned?'is-pinned':''} ${open?'is-sidebar-expanded':''} ${mobileOpen?'mobile-menu-open':''}`}>
  <a className="shell-skip-link" href="#main-content" onClick={event=>{event.preventDefault();document.getElementById('main-content')?.focus()}}>К содержимому</a>
  {mobileOpen&&<button type="button" className="shell-sidebar-backdrop" aria-label="Закрыть меню" tabIndex={-1} onClick={closeMobile}/>}
  <aside id="shell-sidebar" ref={sidebar} className="shell-sidebar" aria-label="Боковая панель" role={mobileOpen?'dialog':undefined} aria-modal={mobileOpen||undefined} onPointerEnter={event=>{if(event.pointerType==='mouse'&&window.matchMedia('(min-width:768px)').matches){pointerInside.current=true;reveal()}}} onPointerLeave={()=>{pointerInside.current=false;scheduleClose()}} onFocusCapture={()=>{if(window.matchMedia('(min-width:768px)').matches)reveal()}} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))scheduleClose()}}>
   <Button variant="ghost" className="ui-icon-button shell-mobile-close" aria-label="Закрыть боковую панель" onClick={closeMobile}><X size={20} strokeWidth={1.5}/></Button>
   <a className="shell-brand" href="#/overview" aria-label="AlmatyAir — обзор" onClick={event=>{event.preventDefault();go('overview')}}><span className="shell-brand-icon"><Activity size={20} strokeWidth={1.5} aria-hidden="true"/></span><span className="shell-brand-copy"><strong>AlmatyAir</strong><small>Данные датчиков</small></span></a>
   <div className="shell-nav-section"><p className="shell-section-label">МОНИТОРИНГ</p><nav className="shell-desktop-nav" aria-label="Основная навигация">{items.map(item=><NavigationLink key={item.page} item={item} page={page} onNavigate={go} compact={!pinned}/>)}</nav></div>
   <div className="shell-sidebar-bottom"><div className="shell-data-note" title="MQ-135 raw · Без калибровки" aria-label="MQ-135 raw · Без калибровки"><span className="shell-status-dot"/><span>MQ-135 raw<small>Без калибровки</small></span></div><Button variant="ghost" className="shell-sidebar-action" aria-label={dark?'Включить светлую тему':'Включить тёмную тему'} title={!open?'Сменить тему':undefined} onClick={onTheme}>{dark?<Sun size={20} strokeWidth={1.5}/>:<Moon size={20} strokeWidth={1.5}/>}<span className="shell-nav-label">{dark?'Светлая тема':'Тёмная тема'}</span></Button><Button variant="ghost" className="shell-sidebar-action shell-pin-button" aria-label={pinned?'Открепить панель':'Закрепить панель'} aria-pressed={pinned} title={pinned?'Открепить панель':'Закрепить панель'} onClick={pin}>{pinned?<PinOff size={20} strokeWidth={1.5}/>:<Pin size={20} strokeWidth={1.5}/>}<span className="shell-nav-label">{pinned?'Открепить панель':'Закрепить панель'}</span></Button></div>
  </aside>
  <div className="shell-body" inert={mobileOpen}><header className="shell-topbar"><div className="shell-breadcrumb"><span className="shell-desktop-label">Рабочее пространство</span><span className="shell-breadcrumb-divider" aria-hidden="true">/</span><strong>{title}</strong></div><div className="shell-mobile-heading"><button ref={burger} type="button" className="ui-button ui-button--ghost ui-icon-button shell-burger" aria-label="Открыть меню" aria-expanded={mobileOpen} aria-controls="shell-sidebar" onClick={()=>setMobileOpen(true)}><Menu size={20} strokeWidth={1.5}/></button><a className="shell-mobile-brand" href="#/overview" aria-label="AlmatyAir — обзор" onClick={event=>{event.preventDefault();go('overview')}}><Activity size={20} strokeWidth={1.5}/><strong>AlmatyAir</strong></a></div><div className="shell-topbar-actions"><span className="shell-location"><MapPin size={16} strokeWidth={1.5} aria-hidden="true"/>Алматы</span><span className="shell-raw-badge">MQ-135 <span>raw</span></span><Button className="ui-icon-button shell-mobile-theme" variant="ghost" aria-label={dark?'Включить светлую тему':'Включить тёмную тему'} onClick={onTheme}>{dark?<Sun size={20} strokeWidth={1.5}/>:<Moon size={20} strokeWidth={1.5}/>}</Button></div></header>
   {welcome&&<div className="shell-welcome">{welcome}</div>}
   <main id="main-content" tabIndex={-1} className={`shell-main shell-page--${page}`} aria-label={title}>{children}</main>
  </div>
  <nav className="shell-mobile-nav" aria-label="Мобильная навигация" inert={mobileOpen}>{items.filter(item=>item.page!=='about').map(item=><NavigationLink key={item.page} item={item} page={page} onNavigate={go}/>)}</nav>
 </div>
}
export function PageSkeleton(){return <div className="shell-loading" role="status" aria-label="Загрузка страницы"><Skeleton style={{height:28,width:'40%'}}/><div className="shell-loading-cards">{[0,1,2].map(key=><Card key={key}><Skeleton style={{width:'50%'}}/><Skeleton style={{height:40,width:'70%',marginTop:24}}/></Card>)}</div><Card><Skeleton style={{height:240}}/></Card></div>}
export function AboutPage({onNavigate}:{onNavigate:(page:Page)=>void}){return <section className="shell-about"><div className="shell-about-heading"><span className="shell-section-label">О ПРОЕКТЕ</span><TypewriterHeading/><p>AlmatyAir помогает следить за показаниями датчиков воздуха в Алматы: на карте, в графиках и в истории измерений.</p></div><div className="shell-about-grid"><Card><Activity size={24} strokeWidth={1.5}/><h2>Измерения</h2><p>MQ-135 raw, температура и влажность — с устройств мониторинга. Координаты и время добавляет телефон.</p></Card><Card><ChartNoAxesCombined size={24} strokeWidth={1.5}/><h2>История и анализ</h2><p>Сравнивайте устройства и периоды, рассматривайте отдельные измерения и изменения показаний.</p></Card><Card><Info size={24} strokeWidth={1.5}/><h2>Честные данные</h2><p>MQ-135 raw — исходный сигнал без калибровки. Он не является AQI, ppm или концентрацией частиц.</p></Card></div><Button variant="primary" onClick={()=>onNavigate('map')}>Открыть карту<ArrowUpRight size={20} strokeWidth={1.5}/></Button></section>}
