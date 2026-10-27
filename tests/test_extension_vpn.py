import subprocess,unittest,shutil
from pathlib import Path
class ExtensionVPN(unittest.TestCase):
 @unittest.skipUnless(shutil.which('node'),'Node necessário')
 def test_private_server_requires_exact_explicit_permission(self):
  script=r'''
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');let approved='http://100.80.0.2:8765',permission=true,calls=[];
const chrome={runtime:{id:'a'.repeat(32),onInstalled:{addListener:()=>{}},onStartup:{addListener:()=>{}},onMessage:{addListener:()=>{}},getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p},contextMenus:{onClicked:{addListener:()=>{}}},tabs:{onCreated:{addListener:()=>{}},onRemoved:{addListener:()=>{}}},storage:{local:{get:async()=>({remoteBase:approved})}},permissions:{contains:async()=>permission}};
const c={chrome,URL,AbortController,setTimeout,clearTimeout,console,fetch:async(u,o)=>{calls.push(u);return{ok:true,json:async()=>({ok:true})}}};vm.createContext(c);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);
(async()=>{await vm.runInContext("request('http://100.80.0.2:8765','/api/capture-save',{},'scoped')",c);assert.equal(calls.length,1);permission=false;await assert.rejects(vm.runInContext("request('http://100.80.0.2:8765','/api/capture-save',{},'scoped')",c),/Autorize/);permission=true;await assert.rejects(vm.runInContext("request('http://100.80.0.3:8765','/api/capture-save',{},'scoped')",c),/Autorize/);for(const u of ['http://8.8.8.8:8765','http://evil.example:8765','http://user:password@100.80.0.2:8765'])await assert.rejects(vm.runInContext('request('+JSON.stringify(u)+',"/api/capture-save",{},"scoped")',c),/inválido/);assert.equal(calls.length,1);await vm.runInContext("request('http://127.0.0.1:8765','/api/capture-save',{},'scoped')",c);assert.equal(calls.length,2);console.log('VPN permission boundary OK')})().catch(e=>{console.error(e);process.exit(1)});
'''
  path=Path(__file__).resolve().parents[1]/'extensao-chrome/background.js'
  r=subprocess.run(['node','-e',script,str(path)],capture_output=True,text=True,timeout=10);self.assertEqual(r.returncode,0,r.stdout+r.stderr)
