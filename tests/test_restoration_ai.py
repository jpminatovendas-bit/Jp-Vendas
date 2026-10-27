import sys,tempfile,unittest,json,threading,base64,time
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import Store
import restoration_ai as ai
from test_flow import workbook,image
class Restoration(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.store=Store(self.root/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS';self.orig=self.root/'orig';image(self.orig/'PESSOA.png');self.store.load_originals(self.key,str(self.orig));self.id=self.store.project(self.key)['pairs'][0]['id'];self.keypatch=patch.object(ai,'api_key',return_value='TEST_KEY_NOT_REAL');self.keypatch.start();self.out=(self.orig/'PESSOA.png').read_bytes()
 def tearDown(self):self.keypatch.stop();self.store.restoration_stop.set();self.store.restoration_wake.set();self.temp.cleanup()
 def body(self,**kw):return {'keys':[self.key],**kw}
 def result(self):return self.out,{'usage':{'total_tokens':123},'request_id':'req_fixture','dimensions':[160,200]}
 def test_queue_no_duplication_and_preserved_original_and_pdf(self):
  original=ai.sha(self.orig/'PESSOA.png');self.assertEqual(ai.enqueue(self.store,self.body())['created'],1);self.assertEqual(ai.enqueue(self.store,self.body())['created'],0)
  with patch.object(ai,'edit_image',return_value=self.result()):self.assertTrue(ai.process_one(self.store))
  p=self.store.project(self.key);self.assertEqual(ai.sha(self.orig/'PESSOA.png'),original);self.assertTrue(Path(p['pairs'][0]['restored']).is_file());self.assertTrue(p['dirty']);self.assertEqual(ai.public(self.store)['counts']['done'],1);self.assertEqual(ai.preview(self.store,self.body())['photos'],0);self.assertFalse(self.store.item(self.key)['contacted'])
  self.store.crest(self.key,self.out,'crest.png');pdf=self.store.pdf(self.key,False);self.assertTrue(pdf['url'])
 def test_redo_retains_previous_version(self):
  ai.enqueue(self.store,self.body())
  with patch.object(ai,'edit_image',return_value=self.result()):ai.process_one(self.store)
  old=self.store.project(self.key)['pairs'][0]['restored'];ai.enqueue(self.store,self.body(photo_id=self.id,redo=True))
  with patch.object(ai,'edit_image',return_value=self.result()):ai.process_one(self.store)
  pair=self.store.project(self.key)['pairs'][0];self.assertIn(old,pair['restoration_versions']);self.assertTrue(Path(old).exists());self.assertNotEqual(pair['restored'],old)
 def test_error_pauses_and_uncertain_not_retried(self):
  ai.enqueue(self.store,self.body())
  with patch.object(ai,'edit_image',side_effect=ai.Uncertain('Timeout incerto')) as edit:ai.process_one(self.store);self.assertFalse(ai.process_one(self.store));edit.assert_called_once()
  self.assertTrue(ai.config(self.store)['paused']);self.assertEqual(ai.enqueue(self.store,self.body())['created'],0);self.assertEqual(ai.public(self.store)['counts']['uncertain'],1);self.assertFalse(self.store.project(self.key)['pairs'][0]['restored'])
 def test_pause_cancel_and_restart(self):
  ai.enqueue(self.store,self.body());ai.control(self.store,{'action':'pause'});self.assertFalse(ai.process_one(self.store));reopened=Store(self.root/'dados');self.assertTrue(ai.config(reopened)['paused']);self.assertEqual(ai.public(reopened)['counts']['pending'],1);ai.control(reopened,{'action':'cancel'});self.assertEqual(ai.public(reopened)['counts']['cancelled'],1)
 def test_interrupted_running_is_uncertain(self):
  ai.enqueue(self.store,self.body());t=ai.tasks(self.store)[0];t['state']='running';ai.write_task(self.store,t);reopened=Store(self.root/'dados');self.assertEqual(ai.public(reopened)['counts']['uncertain'],1)
 def test_changed_original_prevents_charge_and_changed_pair_preserved(self):
  ai.enqueue(self.store,self.body());managed=Path(self.store.project(self.key)['pairs'][0]['original']);managed.write_bytes(b'changed')
  with patch.object(ai,'edit_image') as edit:ai.process_one(self.store);edit.assert_not_called()
  image(managed);ai.enqueue(self.store,self.body(redo=True))
  def changed(*args):
   p=self.store.project(self.key);p['pairs'][0]['restored']='MANUAL.png';self.store.save_project(self.key,p);return self.result()
  with patch.object(ai,'edit_image',side_effect=changed):ai.process_one(self.store)
  self.assertEqual(self.store.project(self.key)['pairs'][0]['restored'],'MANUAL.png');self.assertEqual(ai.public(self.store)['counts']['conflict'],1)
 def test_new_lot_does_not_resume_paused_tasks(self):
  ai.enqueue(self.store,self.body());ai.control(self.store,{'action':'pause'})
  with self.assertRaisesRegex(ValueError,'fila pausada'):ai.enqueue(self.store,self.body())
  self.assertTrue(ai.config(self.store)['paused'])
 def test_limit_and_secret_not_public(self):
  image(self.orig/'OUTRA.png');self.store.load_originals(self.key,str(self.orig));ai.save_config(self.store,{'max_photos':1})
  with self.assertRaises(ValueError):ai.enqueue(self.store,self.body())
  self.assertNotIn('TEST_KEY_NOT_REAL',json.dumps(ai.public(self.store)))
  with self.assertRaises(ValueError):ai.save_config(self.store,{'model':'chat-latest'})
 def test_real_http_multipart_adapter_and_output_validation(self):
  seen=[];output=self.out
  class Gateway(BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_POST(self):
    seen.append((self.path,self.headers.get('Authorization'),self.rfile.read(int(self.headers['Content-Length']))));self.send_response(200);self.send_header('x-request-id','req_test');self.end_headers();self.wfile.write(json.dumps({'data':[{'b64_json':base64.b64encode(output).decode()}],'usage':{'total_tokens':321}}).encode())
  server=ThreadingHTTPServer(('127.0.0.1',0),Gateway);threading.Thread(target=server.serve_forever,daemon=True).start();real=ai.request_json
  def local(req,timeout):req.full_url='http://127.0.0.1:'+str(server.server_port)+'/v1/images/edits';return real(req,timeout)
  try:
   t=ai.preview(self.store,self.body())['tasks'][0];t['config']=ai.config(self.store)
   with patch.object(ai,'request_json',side_effect=local):out,info=ai.edit_image(self.store,t)
   self.assertEqual(info['usage']['total_tokens'],321);self.assertEqual(info['dimensions'],[160,200]);self.assertTrue(out);self.assertEqual(seen[0][0],'/v1/images/edits');self.assertIn(b'name="image[]"',seen[0][2]);self.assertIn(b'1024x1280',seen[0][2]);self.assertEqual(seen[0][1],'Bearer TEST_KEY_NOT_REAL')
   with patch.object(ai,'request_json',return_value=({'data':[{'b64_json':'broken'}]},'')):
    with self.assertRaises(ai.Uncertain):ai.edit_image(self.store,t)
  finally:server.shutdown();server.server_close()
