/** Fit the complete menu's natural layout, including room/crew changes.
 * ResizeObserver measures the unscaled box; zoom and viewport resize affect
 * the available CSS pixels, without creating an internal scrolling panel. */
export function fitMenuLayout(menu,layout){
 let pending=0;
 const fit=()=>{pending=0;const rect=menu.getBoundingClientRect(),style=getComputedStyle(menu),width=rect.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),height=rect.height-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
  if(!width||!height||!layout.offsetWidth||!layout.offsetHeight)return;
  const scale=Math.min(1,width/layout.offsetWidth,height/layout.offsetHeight);
  layout.style.setProperty('--menu-fit',String(scale));menu.dataset.fitted='true';
 };
 const schedule=()=>{if(!pending)pending=requestAnimationFrame(fit);};
 const observer=new ResizeObserver(schedule);observer.observe(menu);observer.observe(layout);
 window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);document.fonts?.ready.then(schedule);schedule();
 return{refresh:schedule,dispose(){observer.disconnect();cancelAnimationFrame(pending);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);}};
}
