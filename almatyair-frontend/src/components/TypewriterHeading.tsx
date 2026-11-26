import {useEffect,useState} from 'react'

const title='Наблюдать. Сравнивать. Понимать.'
export default function TypewriterHeading(){
 const [length,setLength]=useState(title.length)
 useEffect(()=>{
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)')
  let timer:ReturnType<typeof setTimeout>|undefined
  function start(){
   clearTimeout(timer)
   if(motion.matches){setLength(title.length);return}
   let count=0
   setLength(count)
   function tick(){count++;setLength(count);if(count<title.length)timer=setTimeout(tick,65)}
   timer=setTimeout(tick,180)
  }
  start()
  motion.addEventListener('change',start)
  return ()=>{clearTimeout(timer);motion.removeEventListener('change',start)}
 },[])
 return <h1 className="typewriter-heading" aria-label={title}><span className="typewriter-size" aria-hidden="true">{title}</span><span className="typewriter-copy" aria-hidden="true">{title.slice(0,length)}{length<title.length&&<span className="typewriter-caret">|</span>}</span></h1>
}
