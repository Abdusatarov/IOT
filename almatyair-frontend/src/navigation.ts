import {useSyncExternalStore} from 'react'

export type Page = 'overview'|'map'|'analytics'|'calendar'|'about'
const pages:Page[]=['overview','map','analytics','calendar','about']
function currentPage():Page {
 const route=window.location.hash.replace(/^#\/?/,'').split('?')[0]
 return pages.includes(route as Page)?route as Page:'overview'
}
function subscribe(callback:()=>void){window.addEventListener('hashchange',callback);return()=>window.removeEventListener('hashchange',callback)}
export function usePage(){return useSyncExternalStore(subscribe,currentPage,()=> 'overview' as Page)}
export function navigate(page:Page){if(currentPage()===page&&window.location.hash===`#/${page}`)window.scrollTo({top:0});else window.location.hash=`/${page}`}
export function readPreference(key:string,fallback:string){try{return localStorage.getItem(key)??fallback}catch{return fallback}}
export function savePreference(key:string,value:string){try{localStorage.setItem(key,value)}catch{/* Settings remain available for this session. */}}

export function useAnalysisDevice(){return useSyncExternalStore(subscribe,()=>currentPage()==='analytics'?new URLSearchParams(window.location.hash.split('?')[1]??'').get('device'):null,()=>null)}
