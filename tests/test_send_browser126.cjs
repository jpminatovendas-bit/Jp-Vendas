// Executar com Playwright e navegador instalados. Nenhuma mensagem real é enviada.
const path=require('path'),fs=require('fs');process.chdir(path.resolve(__dirname,'..'));const {chromium}=require(process.env.JP_TEST_PLAYWRIGHT||(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright'));fs.mkdirSync('tmp/tests126',{recursive:true});
const {spawn}=require('child_process');const assert=require('assert');
(async()=>{const proc=spawn('python3',['-u',path.join(__dirname,'fixtures/send126.py')],{cwd:process.cwd()});let browser;try{
 const port=await new Promise((resolve,reject)=>{let data='';proc.stdout.on('data',b=>{data+=b;const m=data.match(/PORT=(\d+)/);if(m)resolve(m[1])});proc.stderr.on('data',b=>process.stderr.write(b));proc.on('exit',c=>reject(Error('server exit '+c)));setTimeout(()=>reject(Error('server timeout')),15000)});
 browser=await chromium.launch({executablePath:process.env.JP_TEST_BROWSER||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-zygote','--single-process'],env:{...process.env,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH||''}});
 const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+port);
 const poll=async(fn)=>{for(let i=0;i<150;i++){if(await page.evaluate(fn))return;await new Promise(r=>setTimeout(r,50))}throw Error('poll timeout '+fn)};
 await poll(()=>document.querySelectorAll('#rows [data-city-key]').length===1);
 assert.equal(await page.locator('#rows .phone-shortcut').count(),2);assert.equal(await page.locator('#rows .more-contact-numbers').count(),1);
 assert(await page.evaluate(()=>document.querySelector('.tablewrap').scrollWidth<=document.querySelector('.tablewrap').clientWidth+1));
 await page.locator('#rows .more-contact-numbers').click();assert.equal(await page.locator('#moreNumbersBody126 .phone-shortcut').count(),9);await page.locator('#moreNumbers126 button').filter({hasText:'Fechar'}).click();
 await page.screenshot({path:'tmp/tests126/list.png'});
 await page.evaluate(async()=>{await openItem(0,'send')});await poll(()=>document.querySelectorAll('.send-role .recipient-entry').length>0);
 // Use a fake opener: no recipient receives a message, browser/app switch events are simulated explicitly.
 await page.evaluate(()=>{window.open=()=>({opener:null,location:'',close(){}})});
 const chamberVerified=page.locator('[data-send-target="camara"] [data-send-channel="whatsapp"] [data-recipient]').filter({hasText:'99999-0000'});assert(await chamberVerified.locator('button').evaluate(e=>e.classList.contains('send-recorded')));assert((await chamberVerified.innerText()).includes('WhatsApp confirmado'));assert(!(await chamberVerified.innerText()).includes('✓ Envio registrado'));
 const president=page.locator('[data-send-target="presidente"] [data-send-channel="whatsapp"] .send-recipient-button');await president.click();await poll(()=>sendEvents.get(current.key)?.some(e=>e.verification_state==='pending'));
 assert.equal(await page.evaluate(()=>db.items[0].send_count),0);assert(!await page.locator('#waVerify126').evaluate(e=>e.open));
 await page.evaluate(()=>returnedWhatsApp126());assert(!await page.locator('#waVerify126').evaluate(e=>e.open));
 await page.evaluate(()=>{leftWhatsApp126();returnedWhatsApp126();returnedWhatsApp126()});assert(await page.locator('#waVerify126').evaluate(e=>e.open));assert((await page.locator('#waVerifyContact126').innerText()).includes('Presidente'));
 await page.locator('#waVerify126 button').filter({hasText:'Sim, tem WhatsApp'}).click();await poll(()=>db.items[0].send_count===1&&!document.getElementById('waVerify126').open);
 assert(await president.evaluate(e=>e.classList.contains('send-recorded')));assert((await page.locator('[data-send-target="presidente"] [data-send-channel="whatsapp"]').innerText()).includes('✓ Envio registrado'));
 await poll(()=>document.querySelector('[data-send-target="presidente"] .recipient-state').textContent.includes('✓ Envio registrado'));await page.screenshot({path:'tmp/tests126/send.png'});
 await page.reload();await poll(()=>document.querySelectorAll('#rows [data-city-key]').length===1);await page.evaluate(async()=>{await openItem(0,'send')});await poll(()=>document.querySelectorAll('.send-recipient-button').length>0);
 assert(await page.locator('[data-send-target="presidente"] [data-send-channel="whatsapp"] .send-recipient-button').evaluate(e=>e.classList.contains('send-recorded')));
 // Corrections remove the send mark, not confirmation color.
 await page.evaluate(async()=>{const e=sendEvents.get(current.key).find(x=>x.channel==='whatsapp');await api('/api/interaction-correct',{key:current.key,id:e.id,active:false});await refresh();current=db.items[0];await loadHistory()});assert.equal(await page.evaluate(()=>db.items[0].send_count),0);assert(await page.locator('[data-send-target="presidente"] [data-send-channel="whatsapp"] .send-recipient-button').evaluate(e=>e.classList.contains('send-recorded')));
 // Unknown chamber number: Later remains pending, manual review No rejects it.
 await page.evaluate(()=>{window.open=()=>({opener:null,location:'',close(){}})});
 const unknown=page.locator('[data-send-target="camara"] [data-send-channel="whatsapp"] [data-recipient]').filter({hasText:'99999-0001'}).locator('button');await unknown.click();await poll(()=>sendEvents.get(current.key).some(e=>e.recipient==='5548999990001'));
 await page.evaluate(()=>{leftWhatsApp126();returnedWhatsApp126()});await page.locator('#waVerify126 button').filter({hasText:'Conferir depois'}).click();await poll(()=>!document.getElementById('waVerify126').open);assert.equal(await page.evaluate(()=>db.items[0].send_count),0);
 await page.locator('#sendHistory button').filter({hasText:'Conferir número'}).click();await page.locator('#waVerify126 button').filter({hasText:'Não tem WhatsApp'}).click();await poll(()=>db.items[0].local.phone_status.camara['5548999990001'].verification_state==='absent');assert.equal(await page.evaluate(()=>db.items[0].send_count),0);
 // Known number: no question and immediate send. Blocked unknown: no attempt is stored.
 await chamberVerified.locator('button').click();await poll(()=>db.items[0].send_count===1);await page.evaluate(()=>{leftWhatsApp126();returnedWhatsApp126()});assert(!await page.locator('#waVerify126').evaluate(e=>e.open));
 const beforeBlocked=await page.evaluate(()=>sendEvents.get(current.key).length);await page.evaluate(()=>{window.open=()=>null});await unknown.click();await page.evaluate(()=>{leftWhatsApp126();returnedWhatsApp126()});assert(!await page.locator('#waVerify126').evaluate(e=>e.open));assert.equal(await page.evaluate(()=>sendEvents.get(current.key).length),beforeBlocked);
 assert.deepEqual(errors,[]);console.log('OK browser: compact list no horizontal overflow; all extra phones; confirmed badge/green; pending excluded; ask only after departure/return; one question; Yes commits; reload persistence; correction keeps green; Later/No; known number skips question; blocked popup without attempt; no JS errors.');
 }finally{if(browser)await browser.close();proc.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
