import sys,tempfile,unittest,json,threading,subprocess,shutil
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import capture_routes
import app,restoration_ai as ai,crest_capture as cc
from test_flow import workbook,image
SVG=b'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="140"><rect x="20" y="20" width="60" height="100" fill="#cc2200"/></svg>'
class QueueCrest(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.store=app.Store(self.root/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS';self.folder=self.root/'original';image(self.folder/'A.png');image(self.folder/'B.png');self.store.load_originals(self.key,str(self.folder));self.out=(self.folder/'A.png').read_bytes();self.keypatch=patch.object(ai,'api_key',return_value='TEST_KEY');self.keypatch.start()
 def tearDown(self):self.keypatch.stop();self.store.contact_engine.close();self.temp.cleanup()
 def body(self):return {'keys':[self.key]}
 def result(self):return self.out,{'usage':{},'dimensions':[160,200],'request_id':'fixture'}
 def binding(self):
  with patch.object(cc,'google_html',return_value='<a href="https://pt.wikipedia.org/wiki/Tijucas">Tijucas</a>'),patch.object(cc,'query',return_value={'query':{'pages':{'1':{'title':'Tijucas','extract':'Tijucas é um município brasileiro do estado de Santa Catarina.'}}}}):r=cc.start(self.store,self.key)
  b=self.store.connect_capture(r['ticket'],1);capture_routes.advance(self.store,b['token'],{'tab_id':1,'from_url':b['url'],'url':'https://pt.wikipedia.org/wiki/Tijucas','transition':'link'});self.assertEqual(b['scope'],'crest');return b['token']
 def crest_body(self):return {'tab_id':1,'url':'https://pt.wikipedia.org/wiki/Tijucas','src_url':'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Brasao.svg/120px-Brasao.svg.png'}
 def test_cancelled_and_interrupted_not_resumed_or_active(self):
  ai.enqueue(self.store,self.body());ai.control(self.store,{'action':'interrupt'});self.assertEqual(ai.public(self.store)['active'],[]);self.assertEqual(ai.public(self.store)['counts']['interrupted'],2)
  ai.control(self.store,{'action':'resume'})
  with patch.object(ai,'edit_image') as edit:self.assertFalse(ai.process_one(self.store));edit.assert_not_called()
  ai.enqueue(self.store,self.body());ai.control(self.store,{'action':'cancel'});ai.control(self.store,{'action':'resume'});self.assertFalse(ai.process_one(self.store));self.assertEqual(ai.public(self.store)['active'],[])
 def test_inflight_cancel_archives_result_without_association(self):
  ai.enqueue(self.store,self.body())
  def cancel(*args):ai.control(self.store,{'action':'cancel'});return self.result()
  with patch.object(ai,'edit_image',side_effect=cancel):ai.process_one(self.store)
  r=ai.public(self.store);self.assertEqual(r['active'],[]);self.assertEqual(r['counts']['cancelled'],2);self.assertTrue(any(t.get('output') for t in r['history']));self.assertFalse(self.store.project(self.key)['pairs'][0]['restored'])
  ai.control(self.store,{'action':'resume'});self.assertFalse(ai.process_one(self.store))
 def test_restart_removes_remaining_interrupted_batch(self):
  ai.enqueue(self.store,self.body());t=ai.tasks(self.store)[-1];t['state']='running';ai.write_task(self.store,t);s=app.Store(self.root/'dados');self.assertEqual(ai.public(s)['active'],[]);self.assertEqual(ai.public(s)['counts']['uncertain'],1);self.assertEqual(ai.public(s)['counts']['interrupted'],1)
 def test_municipality_order_and_group_progress(self):
  import io,openpyxl
  w=openpyxl.Workbook();sheet=w.active;sheet.append(['Código Único','Município','UF']);sheet.append(['RS-ERECHIM','Erechim','RS']);b=io.BytesIO();w.save(b);self.store.import_xlsx(b.getvalue());f=self.root/'other';image(f/'C.png');self.store.load_originals('RS-ERECHIM',str(f));ai.enqueue(self.store,{'keys':[self.key,'RS-ERECHIM']});seen=[]
  def complete(store,t):seen.append(t['key']);return self.result()
  with patch.object(ai,'edit_image',side_effect=complete):
   ai.process_one(self.store);r=ai.public(self.store);g=r['groups'][0];self.assertEqual(g['counts']['done'],1);self.assertEqual(g['state'],'running');ai.process_one(self.store);ai.process_one(self.store)
  self.assertEqual(seen,[self.key,self.key,'RS-ERECHIM']);self.assertTrue(all(g['state']=='done' for g in ai.public(self.store)['groups']))
 def test_wiki_first_result_and_fallback(self):
  html='<a href="https://pt.wikipedia.org/wiki/Taquara">Outra</a><a href="https://pt.wikipedia.org/wiki/Tijucas">Tijucas</a>'
  data={'query':{'pages':{'1':{'title':'Tijucas','extract':'Tijucas é um município brasileiro do estado de Santa Catarina.'}}}}
  with patch.object(cc,'google_html',return_value=html),patch.object(cc,'query',return_value=data):
   r=cc.start(self.store,self.key);self.assertIn('google.com/search',self.store.capture_tickets[r['ticket']]['url']);self.assertEqual(r['search_query'],'brasão Tijucas SC');self.assertFalse(r['verified'])
  with patch.object(cc,'google_html',side_effect=ValueError('offline')):r=cc.start(self.store,self.key);self.assertIn('google.com/search',self.store.capture_tickets[r['ticket']]['url']);self.assertFalse(r['verified'])
 def test_crest_svg_transparency_provenance_and_versions(self):
  token=self.binding();old=self.root/'old.png';image(old);self.store.crest(self.key,old.read_bytes(),'old.png');oldpath=self.store.project(self.key)['crest'];self.assertEqual(cc.original_file(self.crest_body()['src_url']),'https://upload.wikimedia.org/wikipedia/commons/a/ab/Brasao.svg')
  with patch.object(cc.public_images,'fetch',return_value=SVG),patch.object(cc,'query',return_value={}):r=cc.capture(self.store,token,self.crest_body())
  p=self.store.project(self.key);self.assertTrue(r['ok']);self.assertTrue(p['dirty']);self.assertIn(oldpath,p['crest_versions']);self.assertTrue(Path(oldpath).exists());pix=app.fitz.Pixmap(p['crest']);self.assertTrue(pix.alpha);self.assertEqual(self.store.capture_updates[-1]['field'],'Brasão');self.assertFalse(self.store.item(self.key)['contacted']);self.assertIn('wiki',p['crest_source']['page'])
 def test_invalid_crest_preserves_existing_and_scope_restrictions(self):
  self.store.crest(self.key,self.out,'crest.png');old=self.store.project(self.key)['crest'];token=self.binding()
  with patch.object(cc.public_images,'fetch',return_value=b'not an image'),patch.object(cc,'query',return_value={}):
   with self.assertRaises(Exception):cc.capture(self.store,token,self.crest_body())
  self.assertEqual(self.store.project(self.key)['crest'],old)
  for u in ['http://127.0.0.1/a','https://upload.wikimedia.org.evil.example/x','https://user:pass@pt.wikipedia.org/x']:
   with self.assertRaises(ValueError):cc.allowed(u)
  with self.assertRaises(ValueError):cc.as_png(b'<svg><script>alert(1)</script></svg>')
  with self.assertRaises(ValueError):self.store.save_capture(token,{'kind':'name','value':'Wrong','url':'https://pt.wikipedia.org/wiki/Tijucas','direct':True})
 @unittest.skipUnless(shutil.which('node'),'Node')
 def test_extension_image_menu_and_child_binding(self):
  js=r'''
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');let install,click,created;let menus=[],calls=[],v={'binding:1':{scope:'crest',page:'https://commons.wikimedia.org/wiki/File:X.svg',base:'http://127.0.0.1:8765',token:'TEST'}};const chrome={runtime:{id:'a'.repeat(32),onInstalled:{addListener:f=>install=f},onStartup:{addListener:()=>{}},onMessage:{addListener:()=>{}},getURL:x=>'chrome-extension://'+'a'.repeat(32)+'/'+x},contextMenus:{removeAll:f=>f(),create:(x,f)=>{menus.push(x);f()},onClicked:{addListener:f=>click=f}},storage:{session:{get:async k=>({[k]:v[k]}),set:async x=>Object.assign(v,x),remove:async()=>{}}},webNavigation:{onCreatedNavigationTarget:{addListener:f=>created=f},onCommitted:{addListener:()=>{}}},tabs:{onCreated:{addListener:()=>{}},onRemoved:{addListener:()=>{}},update:async()=>{}},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},notifications:{create:async()=>{}},windows:{create:async()=>{}}};let c={chrome,URL,AbortController,setTimeout,clearTimeout,console,fetch:async(url,o)=>{calls.push({url,body:JSON.parse(o.body)});return {ok:true,json:async()=>({ok:true,municipality:'Tijucas',uf:'SC'})}}};vm.createContext(c);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);(async()=>{await install();assert.deepEqual(Array.from(menus.find(x=>x.id==='crest').contexts),['image']);await created({tabId:2,sourceTabId:1,url:'https://commons.wikimedia.org/wiki/File:X.svg'});await click({menuItemId:'crest',srcUrl:'https://upload.wikimedia.org/x.svg',pageUrl:'https://commons.wikimedia.org/wiki/File:X.svg'},{id:2});assert.equal(calls[0].url,'http://127.0.0.1:8765/api/capture-navigate');assert.equal(calls[1].url,'http://127.0.0.1:8765/api/crest-save');assert.equal(calls[1].body.src_url,'https://upload.wikimedia.org/x.svg');assert.equal(v['binding:2'].token,'TEST');})().catch(e=>{console.error(e);process.exit(1)});
'''
  r=subprocess.run(['node','-e',js,str(Path(__file__).resolve().parents[1]/'extensao-chrome/background.js')],capture_output=True,text=True,timeout=10);self.assertEqual(r.returncode,0,r.stdout+r.stderr)
