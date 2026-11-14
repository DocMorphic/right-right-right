const bounded=(value,fallback,min,max)=>Number.isFinite(value)&&value>=min&&value<=max?value:fallback;
export function readDrivingSettings(storage){
  let saved={};try{saved=JSON.parse(storage?.getItem('rrr-driving')||'{}')||{};}catch{}
  return {steering:bounded(saved.steering,1,.5,1),mouse:bounded(saved.mouse,.1,.02,.2)};
}
export function installDrivingSettings(parent,storage){
  const settings=readDrivingSettings(storage);
  let index=0;
  for(const [key,label,min,max,step] of [['steering','STEERING',.5,1,.05],['mouse','MOUSE',.02,.2,.01]]){
    const row=document.createElement('label'),text=document.createElement('span'),slider=document.createElement('input');
    row.className='pause-volume-row';row.style.setProperty('--row-y',`${330+index++*54}px`);
    row.style.fontSize='15px';row.style.height='52px';
    slider.type='range';slider.min=min;slider.max=max;slider.step=step;slider.value=settings[key];slider.setAttribute('aria-label',`${label.toLowerCase()} sensitivity`);slider.style.top='20px';slider.style.height='28px';
    const update=()=>{settings[key]=Number(slider.value);text.textContent=`${label}: ${Math.round(settings[key]*(key==='mouse'?1000:100))}${key==='steering'?'%':''}`;slider.style.setProperty('--volume',`${100*(settings[key]-min)/(max-min)}%`);try{storage?.setItem('rrr-driving',JSON.stringify(settings));}catch{}};
    slider.addEventListener('input',update);update();row.append(text,slider);parent.append(row);
  }
  return settings;
}
