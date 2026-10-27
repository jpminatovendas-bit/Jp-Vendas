import http.client,io,json,tempfile,threading,unittest
from pathlib import Path
from unittest.mock import patch
import app,launcher,remote_access

class PromptServer1231(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.previous=(app.STORE,app.ACCESS);app.STORE=app.Store(Path(self.tmp.name)/'dados');app.ACCESS=remote_access.Access({'enabled':False});self.server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);threading.Thread(target=self.server.serve_forever,daemon=True).start()
 def tearDown(self):
  self.server.shutdown();self.server.server_close();app.STORE.contact_engine.close();app.STORE,app.ACCESS=self.previous;self.tmp.cleanup()
 def request(self,path,body=None,token=True):
  c=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3);headers={'Content-Type':'application/json','Cookie':getattr(self,'cookie','')}
  if token:headers['X-App-Token']=app.TOKEN
  c.request('GET' if body is None else 'POST',path,body=None if body is None else json.dumps(body),headers=headers);r=c.getresponse();content=json.loads(r.read());c.close();return r.status,content
 def test_health_and_retired_extractor_preserve_old_prompt(self):
  status,health=self.request('/api/health');self.assertEqual(status,200);self.assertEqual(health['version'],launcher.CURRENT_VERSION)
  app.STORE.set_setting('extractor_prompt',{'prompt':'Mantido'})
  self.assertEqual(self.request('/api/extractor-prompt')[0],401)
  token=app.ACCESS.login('', '127.0.0.1','Jeff');self.cookie='jp_session='+token
  self.assertEqual(self.request('/api/extractor-prompt')[0],410)
  self.assertEqual(self.request('/api/extractor-prompt',{'action':'reset'})[0],410)
  self.assertEqual(app.STORE.setting('extractor_prompt'),{'prompt':'Mantido'})
 def test_access_and_post_token_still_required(self):
  self.assertEqual(self.request('/api/save',{},token=False)[0],401)
  token=app.ACCESS.login('', '127.0.0.1','Jeff');self.cookie='jp_session='+token
  self.assertEqual(self.request('/api/save',{},token=False)[0],403)
