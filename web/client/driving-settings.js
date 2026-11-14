const bounded=(value,fallback,min,max)=>Number.isFinite(value)&&value>=min&&value<=max?value:fallback;
export function readDrivingSettings(storage){
  let saved={};try{saved=JSON.parse(storage?.getItem('rrr-driving')||'{}')||{};}catch{}
  return {steering:bounded(saved.steering,1,.5,1.2),mouse:bounded(saved.mouse,.1,.02,.2)};
}
export function installDrivingSettings(parent,storage){
  const settings=readDrivingSettings(storage);
  for(const [key,label,min,max,step] of [['steering','Steering sensitivity',.5,1.2,.05],['mouse','Mouse sensitivity',.02,.2,.01]]){
    const row=document.createElement('label'),text=document.createElement('span'),slider=document.createElement('input');
    row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0;font-size:16px';
    slider.type='range';slider.min=min;slider.max=max;slider.step=step;slider.value=settings[key];slider.setAttribute('aria-label',label);slider.style.width='140px';
    const update=()=>{settings[key]=Number(slider.value);text.textContent=`${label}: ${Math.round(settings[key]*(key==='mouse'?1000:100))}${key==='steering'?'%':''}`;try{storage?.setItem('rrr-driving',JSON.stringify(settings));}catch{}};
    slider.addEventListener('input',update);update();row.append(text,slider);parent.append(row);
  }
  return settings;
}
