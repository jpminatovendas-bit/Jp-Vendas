// Testes simulados: nenhuma sessão ou mensagem real.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
(async()=>{
 const own='554899868621',number='5548999990001',canonical='554899990001',lid='123456789012345@lid';let result,mapping,calls=0,sent='';
 const wpp={isReady:true,version:'4.7.1',conn:{isAuthenticated:()=>true,isOnline:()=>true,getMyUserId:()=>({user:own,server:'c.us'})},contact:{queryWidExists:async target=>{assert.equal(target,number+'@c.us');calls++;return result},getPnLidEntry:async target=>{assert.equal(target,lid);return mapping}},chat:{sendTextMessage:async target=>{sent=target;return{id:'simulated',ack:1}}}};
 const ctx={window:{WPP:wpp},setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(fs.readFileSync('extensao-chrome/office-runtime132.js','utf8'),ctx);const runtime=ctx.window.__jpMinatoOffice132;
 result={wid:{user:canonical,server:'c.us'}};let r=await runtime.check(number,own);assert.equal(r.state,'confirmed');assert.equal(r.evidence,'canonical_br_mobile');assert.equal(r.checked_number,number);assert.equal(r.canonical_number,canonical);await runtime.send(r.canonical_number,'teste',own);assert.equal(sent,canonical+'@c.us');assert.equal(calls,1);
 result={wid:lid};mapping={lid:{_serialized:lid},phoneNumber:{user:canonical,server:'c.us'}};r=await runtime.check(number,own);assert.equal(r.state,'confirmed');assert.equal(r.evidence,'mapped_lid');
 mapping.lid={_serialized:'999999999999999@lid'};assert.equal((await runtime.check(number,own)).state,'inconclusive');
 mapping={lid:{_serialized:lid},phoneNumber:{user:'554799990001',server:'c.us'}};assert.equal((await runtime.check(number,own)).state,'inconclusive');
 for(const value of [null,undefined,{wid:'554799990001@c.us'},{wid:'554899990002@c.us'},{wid:'99999999999999@lid'},{}]){result=value;mapping=null;assert.equal((await runtime.check(number,own)).state,'inconclusive')}
 result={wid:number+'@c.us'};assert.equal((await runtime.check(number,own)).evidence,'matching_wid');assert.equal((await runtime.check(number,'5548999868621')).state,'inconclusive');assert.equal(calls,11);
 console.log('OK runtime 1.17.2: PN canônico, LID vinculado, diferenças rejeitadas, null inconclusivo; só simulação.');
})().catch(e=>{console.error(e);process.exitCode=1});
