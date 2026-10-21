import HeroMotion from './hero-motion';
import React,{useEffect,useState} from 'react';
import {CSPProvider} from '@cloudflare/kumo/primitives/csp-provider';
import {createRoot} from 'react-dom/client';
import {Select} from '@cloudflare/kumo/components/select';
import {SunIcon,MoonIcon,MonitorIcon} from '@phosphor-icons/react';
import {buttonVariants} from '@cloudflare/kumo/components/button';
import {inputVariants} from '@cloudflare/kumo/components/input';
function Appearance(){const [value,setValue]=useState(window.tinytrailAppearance.get().preference);useEffect(()=>{const update=e=>setValue(e.detail.preference);addEventListener('tinytrail:appearance',update);return()=>removeEventListener('tinytrail:appearance',update);},[]);const Icon=value==='dark'?MoonIcon:value==='light'?SunIcon:MonitorIcon;return <Select value={value} onValueChange={next=>window.tinytrailAppearance.set(next)} aria-label="Appearance" className="appearance-select" renderValue={()=> <span className="appearance-label"><Icon size={18}/><span>{value==='system'?'System':value==='dark'?'Dark':'Light'}</span></span>} items={{system:'System',light:'Light',dark:'Dark'}}/>;}
for(const root of document.querySelectorAll('[data-appearance-root]'))createRoot(root).render(<CSPProvider disableStyleElements><Appearance/></CSPProvider>);
// Dynamic legacy controls use Kumo's exported recipes without replacing DOM nodes or handlers.
function align(root){for(const el of root.querySelectorAll('button:not([data-kumo-component]),input:not([data-kumo-component])')){if(el.closest('[data-appearance-root]')||el.closest('[data-kumo-part]'))continue;if(el.tagName==='BUTTON'){const variant=el.classList.contains('primary')?'primary':el.classList.contains('danger')?'destructive':el.classList.contains('text-button')||el.classList.contains('icon-button')?'ghost':'secondary';el.classList.add(...buttonVariants({variant,size:'base'}).split(/\s+/));el.dataset.kumoRecipe='Button';el.dataset.kumoVariant=variant;}else if(['text','email','url','search','number','tel','password'].includes(el.type)){el.classList.add(...inputVariants({size:'base',variant:'default'}).split(/\s+/));el.dataset.kumoRecipe='Input';}}}
let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;align(document);});};align(document);new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&!n.closest?.('[data-appearance-root]')&&!n.closest?.('[data-kumo-part]'))))schedule();}).observe(document.body,{childList:true,subtree:true});


const hero=document.querySelector('[data-hero-motion]');if(hero)createRoot(hero).render(<HeroMotion/>);
