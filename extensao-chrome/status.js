chrome.storage.session.get('lastResult').then(({lastResult:r})=>{if(r){const el=document.getElementById('lastResult');el.textContent=r.message;el.classList.add(r.error?'error':'success')}});
document.getElementById('refreshMenus').onclick=async()=>{const el=document.getElementById('lastResult');try{const r=await chrome.runtime.sendMessage({action:'refreshMenus'});if(r.error)throw Error(r.error);el.textContent='Menu recriado. Volte à aba vinculada e clique com direito sobre o link.';el.className='banner success'}catch(e){el.textContent=e.message;el.className='banner error'}};

chrome.storage.local.get('remoteBase').then(v=>{document.getElementById('remoteBase').value=v.remoteBase||''});
document.getElementById('authorizeRemote').onclick=async()=>{
 const el=document.getElementById('lastResult');
 try{
  const u=new URL(document.getElementById('remoteBase').value.trim());
  const n=u.hostname.split('.').map(Number),privateIP=n.length===4&&n.every((v,i)=>Number.isInteger(v)&&v>=0&&v<=255&&String(v)===u.hostname.split('.')[i])&&(n[0]===10||(n[0]===172&&n[1]>=16&&n[1]<=31)||(n[0]===192&&n[1]===168)||(n[0]===100&&n[1]>=64&&n[1]<=127));
  if(u.protocol!=='http:'||!privateIP||u.port!=='8765'||u.username||u.password||!['','/'].includes(u.pathname)||u.search||u.hash)throw Error('Use o endereço IPv4 privado da VPN com porta 8765.');
  const origin=u.origin+'/*';
  if(!await chrome.permissions.request({origins:[origin]}))throw Error('Permissão não concedida.');
  const old=await chrome.storage.local.get('remoteBase');
  const registered=await chrome.scripting.getRegisteredContentScripts({ids:['jp-vpn']});
  if(registered.length)await chrome.scripting.unregisterContentScripts({ids:['jp-vpn']});
  await chrome.scripting.registerContentScripts([{id:'jp-vpn',matches:[origin],js:['connect.js'],runAt:'document_idle',persistAcrossSessions:true}]);
  await chrome.storage.local.set({remoteBase:u.origin});
  if(old.remoteBase&&old.remoteBase!==u.origin)await chrome.permissions.remove({origins:[old.remoteBase+'/*']});
  el.textContent='Servidor autorizado. No MVP, abra uma nova captura para o município.';el.className='banner success';
 }catch(e){el.textContent=e.message;el.className='banner error'}
};
