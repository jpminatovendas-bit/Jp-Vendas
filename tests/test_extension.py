import unittest,subprocess,shutil
from pathlib import Path
class Extension(unittest.TestCase):
 @unittest.skipUnless(shutil.which('node'),'Node necessário para testar o service worker')
 def test_menu_link_destination_direct_save_review_and_failure_ack(self):
  root=Path(__file__).resolve().parents[1]
  script=r'''
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');let installed,clicked,mode='direct';const menus=[],calls=[],popups=[],badges=[],notices=[];const values={'binding:9':{base:'http://127.0.0.1:8080',token:'TEST_TOKEN',page:'https://camara.example.org/'}};
const chrome={runtime:{id:'a'.repeat(32),onInstalled:{addListener:f=>installed=f},onStartup:{addListener:()=>{}},onMessage:{addListener:()=>{}},getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p},contextMenus:{removeAll:f=>f(),create:(x,cb)=>{menus.push(x);cb()},onClicked:{addListener:f=>clicked=f}},storage:{session:{get:async k=>({[k]:values[k]}),set:async d=>Object.assign(values,d),remove:async()=>{}}},action:{setBadgeText:async x=>badges.push(x.text),setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},notifications:{create:async x=>notices.push(x)},windows:{create:async x=>popups.push(x)},tabs:{onRemoved:{addListener:()=>{}},update:async()=>{}}};
const context={chrome,URL,AbortController,setTimeout,clearTimeout,console,crypto:require('crypto').webcrypto,fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body});if(mode==='fail')return {ok:false,json:async()=>({error:'DDD divergente'})};return {ok:true,json:async()=>url.endsWith('preview')?{requires_review:mode==='review',previous_link:''}:{ok:true,municipality:'Tijucas',uf:'SC',value:body.value}}}};
vm.createContext(context);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),context);
(async()=>{await installed();assert.equal(menus.length,9);assert.deepEqual(Array.from(menus.find(x=>x.id==='whatsapp_chamber').contexts),['link']);assert.deepEqual(Array.from(menus.find(x=>x.id==='name').contexts),['selection']);
const info={menuItemId:'whatsapp_chamber',selectionText:'Texto de botão diferente',linkUrl:'https://wa.me/5548999994321?text=Original',pageUrl:'https://camara.example.org'};
await clicked(info,{id:9});assert.equal(calls.length,2);assert.equal(calls[1].body.value,info.linkUrl);assert.equal(calls[1].body.direct,true);assert.equal(badges.at(-1),'OK');assert.equal(popups.length,0);
mode='review';await clicked(info,{id:9});assert.equal(calls.length,3);assert.match(popups[0].url,/whatsapp.html/);assert.equal(notices.length,1);const draft=Object.entries(values).find(([key])=>key.startsWith('draft:'))[1];assert.equal(draft.value,info.linkUrl);assert.equal(draft.tabId,9);
mode='fail';await clicked(info,{id:9});assert.equal(badges.at(-1),'!');assert.equal(values.lastResult.error,true);assert.match(values.lastResult.message,/DDD/);assert.equal(calls.length,4);
await clicked(info,{id:10});assert.equal(calls.length,4);assert.equal(badges.at(-1),'!');mode='direct';await clicked({menuItemId:'email_president',linkUrl:'mailto:presidente@example.org?subject=Contato',pageUrl:info.pageUrl},{id:9});assert.equal(calls.at(-1).body.kind,'email_president');assert.equal(calls.at(-1).body.value,'mailto:presidente@example.org?subject=Contato');assert.deepEqual(Array.from(menus.find(x=>x.id==='email_president').contexts),['selection','link']);console.log('extension OK');})().catch(e=>{console.error(e);process.exit(1)});
'''
  r=subprocess.run(['node','-e',script,str(root/'extensao-chrome'/'background.js')],capture_output=True,text=True,timeout=20)
  self.assertEqual(r.returncode,0,r.stdout+r.stderr)
