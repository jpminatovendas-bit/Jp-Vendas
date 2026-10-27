import tempfile,unittest,sys,json,time,threading,http.client
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app,capture_routes
from test_flow import workbook
class Capture(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.store=app.Store(Path(self.temp.name)/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS'
  self.ticket=self.store.start_capture(self.key,'https://camara.exemplo.gov.br/mesa')['ticket'];self.binding=self.store.connect_capture(self.ticket,1);self.token=self.binding['token'];capture_routes.advance(self.store,self.token,{'tab_id':1,'from_url':self.binding['url'],'url':'https://camara.exemplo.gov.br/presidente','transition':'link'})
 def tearDown(self):self.temp.cleanup()
 def body(self,kind,value):return {'tab_id':1,'kind':kind,'value':value,'url':'https://camara.exemplo.gov.br/presidente'}
 def save(self,kind,value,**kw):
  body=self.body(kind,value);preview=self.store.capture_preview(self.token,body);return self.store.save_capture(self.token,{**body,'expected_previous':preview['previous'],**kw})
 def test_capture_wait_wakes_after_commit_and_returns_changed_item_only(self):
  from urllib.request import urlopen
  previous=app.STORE;app.STORE=self.store
  server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
  threading.Thread(target=server.serve_forever,daemon=True).start()
  results=[];errors=[]
  def listen():
   try:
    with urlopen('http://127.0.0.1:'+str(server.server_port)+'/api/capture-changes?after=0&wait=5',timeout=7) as response:results.append(json.loads(response.read()))
   except Exception as e:errors.append(e)
  listener=threading.Thread(target=listen);listener.start()
  try:
   time.sleep(.1);start=time.monotonic()
   self.store.save_capture(self.token,{**self.body('name','AUTOMÁTICO'),'direct':True})
   listener.join(2)
   self.assertFalse(listener.is_alive());self.assertFalse(errors);self.assertLess(time.monotonic()-start,2)
   result=results[0];self.assertEqual(result['keys'],[self.key]);self.assertEqual(len(result['items']),1)
   self.assertEqual(result['items'][0]['fields']['Presidente Atual (Nome)'],'AUTOMÁTICO')
   self.assertEqual(result['updates'][0]['field'],'Presidente Atual (Nome)')
   self.assertEqual(result['sequence'],1);self.assertFalse(result['items'][0]['contacted'])
   with urlopen('http://127.0.0.1:'+str(server.server_port)+'/api/capture-changes?after=1') as response:unchanged=json.loads(response.read())
   self.assertEqual(unchanged['items'],[])
  finally:listener.join(7);server.shutdown();server.server_close();app.STORE=previous
 def test_pairing_single_use_expiry_and_bound_key(self):
  with self.assertRaises(ValueError):self.store.connect_capture(self.ticket,1)
  self.assertEqual(self.binding['key'],self.key)
  with self.assertRaises(ValueError):self.store.capture_preview('wrong',self.body('name','Pessoa'))
  self.store.capture_sessions[self.token]['expires']=time.time()-1
  with self.assertRaises(ValueError):self.save('name','Pessoa')
 def test_name_replacement_manual_override_and_provenance(self):
  with self.assertRaises(ValueError):self.save('name','Novo Presidente')
  self.save('name','Novo Presidente',confirm_replace=True);item=self.store.item(self.key)
  self.assertEqual(item['fields']['Presidente Atual (Nome)'],'Novo Presidente');self.assertIn('Presidente Atual (Nome)',item['overrides']);self.assertEqual(item['local']['captures'][0]['url'],self.body('name','')['url']);self.assertFalse(item['contacted']);self.assertFalse(self.store.interaction_history(self.key))
 def test_phones_append_without_duplicate_and_ddd_confirmation(self):
  original=self.store.item(self.key)['fields']['Telefone Planilha Original'];self.save('phone_chamber','(48) 99999-4321');self.save('phone_chamber','+55 48 99999-4321')
  item=self.store.item(self.key);self.assertIn(original,item['fields']['Telefone Planilha Original']);self.assertEqual(len(app.phone_numbers(item['fields']['Telefone Planilha Original'])),2);self.assertFalse(item['local']['phone_status']['camara']['5548999994321']['whatsapp_verified'])
  with self.assertRaises(ValueError):self.save('phone_president','(54) 99999-4321')
  self.save('phone_president','(54) 99999-4321',confirm_ddd=True)
 def test_capture_preserves_whatsapp_verification(self):
  self.store.add_phone(self.key,{'target':'camara','number':'(48) 99999-4321','whatsapp_verified':True});self.save('phone_chamber','(48) 99999-4321');self.assertTrue(self.store.item(self.key)['local']['phone_status']['camara']['5548999994321']['whatsapp_verified'])
 def test_emails_append_case_insensitive_and_distinct_targets(self):
  self.save('email_chamber','camara@example.org');self.save('email_chamber','CAMARA@example.org');self.save('email_chamber','outra@example.org');self.save('email_president','pessoa@example.org');f=self.store.item(self.key)['fields'];self.assertEqual(f['Email Geral da Câmara'],'camara@example.org; outra@example.org');self.assertEqual(f['Presidente - Email'],'pessoa@example.org')
 def test_validation_and_concurrent_change(self):
  for kind,value in [('unknown','Pessoa'),('email_chamber','abc'),('phone_chamber','123'),('name','Pessoa\nOutros')]:
   with self.assertRaises(ValueError):self.store.capture_preview(self.token,self.body(kind,value))
  body=self.body('name','Novo');r=self.store.capture_preview(self.token,body);self.store.save_item(self.key,{'Presidente Atual (Nome)':'Outra pessoa'},{})
  with self.assertRaises(ValueError):self.store.save_capture(self.token,{**body,'expected_previous':r['previous'],'confirm_replace':True})
 def test_other_site_blocked_even_with_confirmation_or_direct_save(self):
  body={**self.body('email_chamber','novo@example.org'),'url':'https://outra.exemplo.gov.br/'}
  with self.assertRaises(ValueError):self.store.capture_preview(self.token,body)
  for extra in ({'confirm_source':True},{'direct':True}):
   with self.assertRaises(ValueError):self.store.save_capture(self.token,{**body,**extra})
 def test_direct_save_replaces_name_without_confirmation_or_preview(self):
  body=self.body('name','Presidente direto');result=self.store.save_capture(self.token,{**body,'direct':True});self.assertTrue(result['ok']);self.assertEqual(self.store.item(self.key)['fields']['Presidente Atual (Nome)'],'Presidente direto');self.assertEqual(self.store.capture_sequence,1);self.assertEqual(self.store.capture_events,[(1,self.key)]);self.assertFalse(self.store.item(self.key)['contacted'])
 def test_failed_direct_save_is_not_reported_as_change(self):
  with self.assertRaises(ValueError):self.store.save_capture(self.token,{**self.body('email_chamber','inválido'),'direct':True})
  self.assertEqual(self.store.capture_sequence,0);self.assertFalse(self.store.capture_events)
 def test_mailto_destination_ignores_subject_body_cc_and_decodes_address(self):
  body={**self.body('email_president','mailto:presidente%40example.org?subject=Contato&body=Texto&cc=outro@example.org'),'direct':True};self.store.save_capture(self.token,body);self.assertEqual(self.store.item(self.key)['fields']['Presidente - Email'],'presidente@example.org')
  with self.assertRaises(ValueError):self.store.save_capture(self.token,{**body,'value':'mailto:a@example.org,b@example.org'})
 def test_tel_links_save_selected_phone_without_whatsapp_confirmation(self):
  for kind,target in [('phone_chamber','camara'),('phone_president','presidente')]:
   body={**self.body(kind,'tel:+55(55) 99997-4126'),'direct':True,'confirm_ddd':True};result=self.store.save_capture(self.token,body)
   self.assertEqual(result['value'],'(55) 99997-4126');item=self.store.item(self.key);self.assertIn('(55) 99997-4126',item['fields'][result['field']]);self.assertFalse(item['local']['phone_status'][target]['5555999974126']['whatsapp_verified'])
  body={**self.body('phone_chamber','TEL:%2B55%2848%29%203333-1234;ext=999?ignored=55'),'direct':True};r=self.store.save_capture(self.token,body);self.assertEqual(r['value'],'(48) 3333-1234')
 def test_email_prefixes_and_parameters_are_not_saved(self):
  for raw in ['mailto:camara@sedenova.rs.gov.br?subject=Oi&body=texto','MAILTO:camara%40sedenova.rs.gov.br?cc=outro@example.org','E-mail: camara@sedenova.rs.gov.br','camara@sedenova.rs.gov.br?subject=Oi']:
   self.store.save_capture(self.token,{**self.body('email_chamber',raw),'direct':True})
  self.assertEqual(self.store.item(self.key)['fields']['Email Geral da Câmara'],'camara@sedenova.rs.gov.br')
  self.store.save_capture(self.token,{**self.body('email_president','Mailto:presidente@example.org?body=abc'),'direct':True});self.assertEqual(self.store.item(self.key)['fields']['Presidente - Email'],'presidente@example.org')
  for raw in ['mailto:um@example.org,dois@example.org','mailto:um@example.org;dois@example.org','javascript:camara@example.org']:
   with self.assertRaises(ValueError):self.store.save_capture(self.token,{**self.body('email_chamber',raw),'direct':True})
 def test_http_auth_only_extension_origin_and_scoped_token(self):
  old=app.STORE;app.STORE=self.store;server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
  try:
   def post(path,body,headers):
    c=http.client.HTTPConnection('127.0.0.1',server.server_port);c.request('POST',path,json.dumps(body),{'Content-Type':'application/json',**headers});r=c.getresponse();status=r.status;r.read();c.close();return status
   self.assertEqual(post('/api/capture-save',self.body('name','Novo'),{'Origin':'https://evil.example','X-Capture-Token':self.token}),403)
   self.assertEqual(post('/api/capture-preview',self.body('name','Novo'),{'Origin':'chrome-extension://'+'a'*32,'X-Capture-Token':self.token}),200)
   self.assertEqual(post('/api/capture-preview',self.body('name','Novo'),{'X-JP-Extension':'a'*32,'X-Capture-Token':self.token}),200)
   self.assertEqual(post('/api/capture-save',{**self.body('name','Direto por HTTP'),'direct':True},{'X-JP-Extension':'a'*32,'X-Capture-Token':self.token}),200)
   self.assertEqual(self.store.item(self.key)['fields']['Presidente Atual (Nome)'],'Direto por HTTP')
   self.assertEqual(post('/api/capture-preview',self.body('name','Novo'),{'Origin':'https://evil.example','X-JP-Extension':'a'*32,'X-Capture-Token':self.token}),403)
   self.assertEqual(post('/api/capture-preview',self.body('name','Novo'),{'X-JP-Extension':'bad','X-Capture-Token':self.token}),403)
   self.assertEqual(post('/api/save',{'key':self.key},{'Origin':'chrome-extension://'+'a'*32,'X-Capture-Token':self.token}),403)
  finally:server.shutdown();server.server_close();app.STORE=old
