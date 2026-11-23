const field=document.getElementById('address'),error=document.getElementById('error');
window.connectionSettings.read().then(config=>{field.value=config.remote||'';field.focus();});
document.getElementById('cancel').onclick=()=>window.connectionSettings.cancel();
document.getElementById('save').onclick=async()=>{const button=document.getElementById('save');button.disabled=true;error.textContent='';try{const result=await window.connectionSettings.save(field.value);if(result?.error)error.textContent=result.error;}catch{error.textContent='Could not change the game connection.';}finally{button.disabled=false;}};
field.onkeydown=event=>{if(event.key==='Enter')document.getElementById('save').click();};
