if(location.pathname==='/capturar'){
 const ticket=new URLSearchParams(location.search).get('ticket');
 if(ticket)chrome.runtime.sendMessage({action:'connect',ticket},result=>{const el=document.getElementById('captureStatus');if(el&&(chrome.runtime.lastError||result?.error))el.textContent=result?.error||'Não foi possível conectar. Abra a captura novamente no MVP.'});
}

if(location.pathname==='/whatsapp-escritorio'){const ticket=new URLSearchParams(location.search).get('ticket');if(ticket)chrome.runtime.sendMessage({action:'officeConnect',ticket},result=>{const el=document.getElementById('officeStatus');if(el&&(chrome.runtime.lastError||result?.error))el.textContent=result?.error||'Não foi possível conectar. Recarregue a extensão e abra o vínculo novamente pelo MVP.'})}
