let active=false,timer=null,busy=false;
const status=document.getElementById('status');
async function tick(){if(!active||busy)return;busy=true;try{const r=await chrome.runtime.sendMessage({action:'verifierTick'});if(r.error)throw Error(r.error);status.textContent=r.data.message;if(r.data.stop)active=false}catch(e){active=false;status.textContent=e.message}finally{busy=false;if(active)timer=setTimeout(tick,10000)}}
document.getElementById('start').onclick=async()=>{try{if(!await chrome.permissions.request({origins:['https://web.whatsapp.com/*']}))throw Error('Permissão do WhatsApp Web não concedida.');active=true;clearTimeout(timer);tick()}catch(e){status.textContent=e.message}};
document.getElementById('stop').onclick=()=>{active=false;clearTimeout(timer);status.textContent='Consultas paradas nesta janela. A fila permanece no MVP.'};
