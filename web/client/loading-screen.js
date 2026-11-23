const phases={prepare:[0,4,'Loading…'],models:[4,40,'Car and crew'],surfaces:[40,52,'Track'],cockpit:[52,70,'Dashboard'],scenery:[70,96,'Forest'],ready:[96,100,'Ready']};
/** Percent is setup-stage completion, never a guessed byte download counter. */
export class LoadingScreen{
 constructor(root){this.root=root;this.progress=root.querySelector('progress');this.percent=root.querySelector('[data-load-percent]');this.status=root.querySelector('#load-status');this.title=root.querySelector('[data-load-title]');this.retry=root.querySelector('[data-load-retry]');this.value=0;this.failed=false;this.retry.addEventListener('click',()=>location.reload());this.update('Reading rally data…',{phase:'prepare'});}
 update(message,{phase='prepare',loaded=0,total=1}={}){
  if(this.failed)return;
  const [start,end,label]=phases[phase]||phases.prepare;
  this.value=Math.max(this.value,start+(end-start)*Math.max(0,Math.min(1,loaded/Math.max(1,total))));
  this.progress.value=this.value;this.percent.textContent=`${Math.floor(this.value)}%`;this.status.textContent=label;
 }
 complete(){this.update('Ready',{phase:'ready',loaded:1});this.root.setAttribute('aria-busy','false');}
 fail(message){this.failed=true;this.root.dataset.state='error';this.root.setAttribute('aria-busy','false');this.title.textContent='Couldn’t load game';this.status.textContent=message||'Check your connection and retry.';this.retry.hidden=false;}
}
