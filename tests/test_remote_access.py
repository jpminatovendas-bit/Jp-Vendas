import http.client,json,tempfile,threading,time,unittest
from pathlib import Path
from unittest.mock import patch
import app,remote_access
from test_flow import workbook

class RemoteAccess(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.folder=Path(self.temp.name)/'dados'
  config=remote_access.save_config(self.folder,'100.80.0.2','SenhaTeste123!')
  self.old=(app.STORE,app.ACCESS);app.ACCESS=remote_access.Access(config);app.STORE=app.Store(self.folder);app.STORE.import_xlsx(workbook())
  class RemoteHandler(app.Handler):
   def setup(self):
    super().setup();self.client_address=('100.80.0.3',self.client_address[1])
  self.server=app.ThreadingHTTPServer(('127.0.0.1',0),RemoteHandler);threading.Thread(target=self.server.serve_forever,daemon=True).start()
  self.cookie=''
 def tearDown(self):
  self.server.shutdown();self.server.server_close();app.STORE,app.ACCESS=self.old;self.temp.cleanup()
 def request(self,path='/',body=None,headers=None):
  c=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
  h={'Cookie':self.cookie,'Origin':'http://127.0.0.1:'+str(self.server.server_port),'X-App-Token':app.TOKEN}
  h.update(headers or {});c.request('POST' if body is not None else 'GET',path,json.dumps(body) if body is not None else None,h)
  r=c.getresponse();content=r.read();status=r.status;cookie=r.getheader('Set-Cookie');c.close()
  return status,content,cookie
 def login(self):
  status,content,cookie=self.request('/api/login',{'operator':'Jeff','password':'SenhaTeste123!'})
  self.assertEqual(status,200,content);self.cookie=cookie.split(';')[0];return cookie
 def test_login_protects_data_files_and_app_token(self):
  status,page,_=self.request();self.assertEqual(status,200);self.assertNotIn(app.TOKEN.encode(),page);self.assertIn(b'password',page)
  for path in ['/api/data','/api/project?key=SC-TIJUCAS','/api/restoration','/file/fake']:
   self.assertEqual(self.request(path)[0],401)
  self.assertEqual(self.request('/api/save',{'key':'SC-TIJUCAS','fields':{'Presidente Atual (Nome)':'INDEVIDO'}})[0],401)
  cookie=self.login();self.assertIn('HttpOnly',cookie);self.assertIn('SameSite=Strict',cookie)
  self.assertEqual(self.request('/api/data')[0],200);self.assertIn(app.TOKEN.encode(),self.request()[1])
  self.assertEqual(self.request('/api/save',{'key':'SC-TIJUCAS','fields':{'Presidente Atual (Nome)':'Remoto'}})[0],200)
  self.assertEqual(app.STORE.item('SC-TIJUCAS')['fields']['Presidente Atual (Nome)'],'Remoto')
  self.assertEqual(self.request('/api/logout',{})[0],200);self.assertEqual(self.request('/api/data')[0],401)
 def test_host_origin_rate_limit_and_session_expiry(self):
  self.assertEqual(self.request('/api/data',headers={'Host':'evil.example:'+str(self.server.server_port)})[0],403)
  self.assertEqual(self.request('/api/login',{'operator':'Jeff','password':'SenhaTeste123!'},headers={'Origin':'http://evil.example'})[0],403)
  for _ in range(5):self.assertEqual(self.request('/api/login',{'operator':'Jeff','password':'wrong'})[0],400)
  status,body,_=self.request('/api/login',{'operator':'Jeff','password':'SenhaTeste123!'});self.assertEqual(status,400);self.assertIn(b'tentativas',body)
  app.ACCESS.failures.clear();self.login();token=self.cookie.split('=',1)[1];app.ACCESS.sessions[token]=time.time()-1;self.assertEqual(self.request('/api/data')[0],401)
 def test_extension_pairing_without_browser_cookie_still_scoped(self):
  self.login();status,content,_=self.request('/api/capture-start',{'key':'SC-TIJUCAS','url':'https://camara.exemplo.gov.br/mesa'})
  self.assertEqual(status,200);ticket=json.loads(content)['ticket'];self.cookie=''
  h={'X-JP-Extension':'a'*32,'Origin':''}
  status,content,_=self.request('/api/capture-connect',{'ticket':ticket,'tab_id':5},h);self.assertEqual(status,200,content);token=json.loads(content)['token']
  status,content,_=self.request('/api/capture-save',{'tab_id':5,'kind':'name','value':'Presidente VPN','url':'https://camara.exemplo.gov.br/mesa','direct':True},{**h,'X-Capture-Token':token})
  self.assertEqual(status,200,content);self.assertEqual(app.STORE.item('SC-TIJUCAS')['fields']['Presidente Atual (Nome)'],'Presidente VPN')
  self.assertEqual(self.request('/api/capture-connect',{'ticket':ticket,'tab_id':5},h)[0],400)
  self.assertEqual(self.request('/api/capture-save',{'kind':'name','value':'Errado'},{**h,'X-Capture-Token':'bad'})[0],400)
 def test_remote_picker_and_server_control_not_on_office_desktop(self):
  self.login()
  with patch.object(app.STORE,'pick_folder') as picker:
   self.assertEqual(self.request('/api/pick-folder',{})[0],400);picker.assert_not_called()
  self.assertEqual(self.request('/api/server-stop',{}, {'X-Server-Control':app.ACCESS.control})[0],403)
 def test_password_not_plaintext_and_only_private_binding(self):
  text=(self.folder/'acesso-remoto.json').read_text();self.assertNotIn('SenhaTeste123!',text)
  for ip in ['0.0.0.0','8.8.8.8','127.0.0.1','::1','example.com']:
   with self.assertRaises(ValueError):remote_access.vpn_ip(ip)
  for ip in ['100.64.0.1','100.127.255.254','10.8.0.1','192.168.190.1','172.20.0.1']:self.assertEqual(remote_access.vpn_ip(ip),ip)
  old=remote_access.load_config(self.folder);new=remote_access.save_config(self.folder,'10.8.0.2','',old);self.assertEqual(new['password_hash'],old['password_hash'])
  with self.assertRaises(ValueError):remote_access.save_config(self.folder,'10.8.0.2','short',old)
