import {useId,useRef,useState} from 'react'
import type {ButtonHTMLAttributes,HTMLAttributes,ReactNode} from 'react'

export function Button({variant='secondary',className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'|'danger'}) {
 return <button type="button" className={`ui-button ui-button--${variant} ${className}`} {...props}/>
}
export function Card({className='',...props}:HTMLAttributes<HTMLElement>){return <section className={`ui-card ${className}`} {...props}/>}
export function SegmentedControl<T extends string>({label,value,options,onChange}:{label:string;value:T;options:{value:T;label:string}[];onChange:(value:T)=>void}) {
 return <div className="ui-segments" role="group" aria-label={label}>{options.map(option=><button type="button" key={option.value} aria-pressed={value===option.value} onClick={()=>onChange(option.value)}>{option.label}</button>)}</div>
}
export function DeviceCombobox({devices,value,onChange,label='Устройство'}:{devices:string[];value:string;onChange:(value:string)=>void;label?:string}) {
 const id=useId(),input=useRef<HTMLInputElement>(null)
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0)
 const options=[{value:'Весь город',label:'Весь город'},...[...new Set(devices)].filter(device=>device!=='Весь город').sort().map(device=>({value:device,label:device}))]
 const filtered=options.filter(option=>option.label.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')))
 const index=Math.min(active,Math.max(0,filtered.length-1))
 function select(next:string){onChange(next);setOpen(false);setQuery('')}
 return <div className="ui-combobox" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){setOpen(false);setQuery('')}}}>
  <label htmlFor={id}>{label}</label>
  <div className={`ui-combobox-field ${open?'is-open':''}`}>
   <svg viewBox="0 0 24 24" className="ui-icon" aria-hidden="true"><path d="M4 17v-4m5 4V7m5 10v-7m5 7V4"/></svg>
   <input id={id} ref={input} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open&&filtered.length?`${id}-option-${index}`:undefined} autoComplete="off" value={open?query:value} placeholder="Поиск устройства" onFocus={()=>{setOpen(true);setQuery('');setActive(0)}} onChange={event=>{setQuery(event.target.value);setActive(0);setOpen(true)}} onKeyDown={event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
     event.preventDefault()
     if(!open){setOpen(true);setQuery('');setActive(0)}
     else setActive(current=>Math.max(0,Math.min(filtered.length-1,current+(event.key==='ArrowDown'?1:-1))))
    }
    if(event.key==='Enter'&&open&&filtered[index]){event.preventDefault();select(filtered[index].value)}
    if(event.key==='Escape'){event.preventDefault();setOpen(false);setQuery('')}
   }}/>
   <button type="button" tabIndex={-1} aria-label={open?'Закрыть список устройств':'Открыть список устройств'} onMouseDown={event=>event.preventDefault()} onClick={()=>{if(open){setOpen(false);setQuery('')}else input.current?.focus()}}><svg viewBox="0 0 24 24" className="ui-icon" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>
  </div>
  {open&&<div className="ui-combobox-popover"><div id={`${id}-list`} role="listbox" aria-label={label}>{filtered.length?filtered.map((option,i)=><button type="button" tabIndex={-1} role="option" aria-selected={value===option.value} id={`${id}-option-${i}`} key={option.value} className={index===i?'is-highlighted':''} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(i)} onClick={()=>select(option.value)}><span>{option.label}</span>{value===option.value&&<svg viewBox="0 0 24 24" className="ui-icon" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>}</button>):<p className="ui-combobox-empty" role="status">Устройства не найдены</p>}</div></div>}
 </div>
}
export function Notice({children,kind='info',onDismiss}:{children:ReactNode;kind?:'info'|'warning'|'error';onDismiss?:()=>void}) {
 return <div className={`ui-notice ui-notice--${kind}`} role={kind==='error'?'alert':'status'}><svg viewBox="0 0 24 24" className="ui-icon" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></svg><div>{children}</div>{onDismiss&&<Button variant="ghost" className="ui-icon-button" aria-label="Закрыть сообщение" onClick={onDismiss}><svg viewBox="0 0 24 24" className="ui-icon" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></Button>}</div>
}
export function Skeleton({className='',...props}:HTMLAttributes<HTMLDivElement>){return <div aria-hidden="true" className={`ui-skeleton ${className}`} {...props}/>}
export function EmptyState({title='Нет измерений',description='Выберите другое устройство или период.'}:{title?:string;description?:string}) {
 return <div className="ui-empty"><svg viewBox="0 0 24 24" className="ui-icon" aria-hidden="true"><path d="M4 4v16h16M8 15l4-5 4 2 4-7"/></svg><strong>{title}</strong><p>{description}</p></div>
}
export function ErrorState({onRetry}:{onRetry:()=>void}){return <Notice kind="error"><strong>Не удалось загрузить измерения</strong><p>Проверьте соединение и попробуйте ещё раз.</p><Button onClick={onRetry}>Повторить</Button></Notice>}
