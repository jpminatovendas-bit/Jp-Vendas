import tempfile,unittest,sys,time,json,threading,io
from pathlib import Path
import openpyxl
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import Store
import contact_extractor as c
class Dummy:
 def __init__(self,result,delay=0):self.result=result;self.delay=delay;self.calls=[]
 def ensure(self,config):pass
 def call(self,path,body,config):
  self.calls.append(body);time.sleep(self.delay)
  if isinstance(self.result,Exception):raise self.result
  return {'data':self.result}
class Contacts(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.store=Store(Path(self.tmp.name)/'dados');w=openpyxl.Workbook();s=w.active;s.append(['Código Único','Município','UF','Website Câmara','Presidente Atual (Nome)','Telefones Coletados no Site','Email Geral da Câmara'])
  for i in range(105):s.append([f'SC-{i}','Cidade '+str(i),'SC','https://camara.example.org','Presidente anterior','(48) 3333-0000','antigo@example.org'])
  b=io.BytesIO();w.save(b);self.store.import_xlsx(b.getvalue());self.key='SC-0';self.store.set_setting('contact_extractor_config',{'interval':0,'concurrency':1})
 def tearDown(self):
  for event in self.store.contact_cancel.values():event.set()
  engine=self.store.contact_engine
  if hasattr(engine,'close'):engine.close()
  self.tmp.cleanup()
 def wait(self,jid):
  end=time.time()+8
  while time.time()<end:
   j=c.job(self.store,jid)
   if j['status']!='running':return j
   time.sleep(.02)
  self.fail('Fila não terminou')
 def payload(self):return {'origemDados':'https://camara.example.org/mesa','presidenteNome':'Presidente novo','camaraTelefoneSite':['+55 48 3333-0000','(48) 99999-1234'],'camaraEmail':'novo@example.org','confianca':'alta','notas':'Extraído do site atual','network':{'visited':['https://camara.example.org/mesa']}}
 def test_preserve_manual_contacts_photos_routes_and_history(self):
  self.store.save_item(self.key,{'Presidente Atual (Nome)':'Presidente conferido'},{'commercial':'Cliente','sector':'Sul','captures':[{'field':'Nome'}]})
  self.store.set_setting('unrelated',{'preserved':True});summary=c.apply_result(self.store,self.key,self.payload());x=self.store.item(self.key)
  self.assertEqual(x['fields']['Presidente Atual (Nome)'],'Presidente conferido');self.assertEqual(x['source']['Presidente Atual (Nome)'],'Presidente novo');self.assertEqual(x['local']['commercial'],'Cliente');self.assertEqual(x['local']['sector'],'Sul');self.assertEqual(len(x['local']['captures']),1);self.assertFalse(self.store.interaction_history(self.key));self.assertEqual(x['fields']['Telefones Coletados no Site'],'(48) 3333-0000; (48) 99999-1234');self.assertIn('antigo@example.org',x['fields']['Email Geral da Câmara']);self.assertIn('Presidente Atual (Nome)',summary['preserved_fields']);self.assertEqual(self.store.setting('unrelated'),{'preserved':True})
 def test_empty_result_does_not_clear_fields(self):
  before=self.store.item(self.key)['fields'];c.apply_result(self.store,self.key,{'origemDados':'https://camara.example.org','presidenteNome':'Não identificado na Mesa Diretora','camaraEmail':''});after=self.store.item(self.key)['fields'];self.assertEqual(before['Presidente Atual (Nome)'],after['Presidente Atual (Nome)']);self.assertEqual(before['Email Geral da Câmara'],after['Email Geral da Câmara'])
 def test_all_filtered_not_only_first_page(self):
  self.store.contact_engine=Dummy(self.payload());jid=c.start(self.store,[f'SC-{i}' for i in range(105)],'extract','105 filtrados')['job'];j=self.wait(jid);self.assertEqual(len(self.store.contact_engine.calls),105);self.assertTrue(all(x['state']=='done' for x in j['items']));self.assertEqual(len(self.store.items()),105)
 def test_search_site_saved_automatically_without_confirmation(self):
  self.store.contact_engine=Dummy({'valid':True,'resolvedUrl':'https://nova.camara.org','source':'google_search','message':'Site encontrado'});j=self.wait(c.start(self.store,[self.key],'search','Google')['job']);self.assertEqual(j['items'][0]['state'],'done');item=self.store.item(self.key);self.assertEqual(item['fields']['Website Câmara'],'https://nova.camara.org');self.assertNotIn('candidate',item['local']['extractor']);self.assertEqual(item['local']['site_changes'][-1]['method'],'automatic');self.assertFalse(item['contacted'])

 def test_new_domain_extraction_does_not_apply_wrong_contacts(self):
  self.store.contact_engine=Dummy({**self.payload(),'origemDados':'https://outra.camara.org'});j=self.wait(c.start(self.store,[self.key],'extract','Um')['job']);self.assertEqual(j['items'][0]['state'],'candidate');self.assertEqual(self.store.item(self.key)['fields']['Presidente Atual (Nome)'],'Presidente anterior')
 def test_failure_preserves_useful_data(self):
  self.store.contact_engine=Dummy(ValueError('Falha temporária'));j=self.wait(c.start(self.store,[self.key],'extract','Um')['job']);self.assertEqual(j['items'][0]['state'],'error');self.assertEqual(self.store.item(self.key)['fields']['Presidente Atual (Nome)'],'Presidente anterior');self.assertIn(self.key,c.invalid_keys(self.store.items()))
 def test_cancel_pending_keeping_started_requests(self):
  self.store.contact_engine=Dummy(self.payload(),delay=.15);jid=c.start(self.store,[f'SC-{i}' for i in range(20)],'extract','Vinte')['job'];time.sleep(.05);c.cancel(self.store,jid);j=self.wait(jid);self.assertEqual(j['status'],'cancelled');self.assertEqual(len(self.store.contact_engine.calls),1);self.assertEqual(sum(x['state']=='cancelled' for x in j['items']),19)
 def test_settings_mask_key_and_preserve_when_blank(self):
  c.save_settings(self.store,{**c.DEFAULTS,'api_key':'FAKE_TEST_KEY','use_ai':True});r=c.public_config(self.store);self.assertTrue(r['key_present']);self.assertNotIn('FAKE_TEST_KEY',json.dumps(r));c.save_settings(self.store,{**c.DEFAULTS,'api_key':''});self.assertEqual(self.store.setting('contact_extractor_openai_key'),'FAKE_TEST_KEY')
 def test_job_persistence_and_interrupted_startup(self):
  with self.store.connect() as db:db.execute('INSERT INTO contact_jobs VALUES (?,?)',('old',json.dumps({'id':'old','status':'running','items':[{'key':self.key,'state':'running'}]})))
  new=Store(self.store.folder);self.assertEqual(c.job(new,'old')['status'],'interrupted');self.assertEqual(c.job(new,'old')['items'][0]['state'],'interrupted');new.contact_engine.close()
 def test_rules_survive_new_engine_initialization(self):
  r=c.rules(self.store);r['developer-signatures.json'][0]['developer']='Customizado';c.save_rules(self.store,r);new=Store(self.store.folder);self.assertEqual(c.rules(new)['developer-signatures.json'][0]['developer'],'Customizado');new.contact_engine.close()
if __name__=='__main__':unittest.main()

class OriginalEngine(unittest.TestCase):
 def test_real_engine_parser_and_private_endpoint_authorization(self):
  from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
  import urllib.request,urllib.error
  class Fixture(BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_GET(self):
    html='''<html><title>Câmara Municipal de Tijucas SC</title><h1>Câmara Municipal de Tijucas SC</h1><a href="/mesa-diretora">Mesa Diretora</a><a href="/contato">Contato</a><h2>Mesa Diretora</h2><div class="card"><h3>Presidente</h3><a href="/vereador/joao">João Silva Teste</a></div><table><tr><td>Presidente</td><td><a href="/vereador/joao">João Silva Teste</a></td></tr></table><p>Nome completo: João Silva Teste</p><p>Telefone: (48) 99999-1234</p><a href="mailto:camara@tijucas.example.org">camara@tijucas.example.org</a><footer>(48) 3333-0000</footer></html>'''
    self.send_response(200);self.end_headers();self.wfile.write(html.encode())
  with tempfile.TemporaryDirectory() as t:
   store=Store(Path(t)/'dados')
   if not store.contact_engine.available()['ready']:self.skipTest('Instale as dependências Node do motor para este teste integrado.')
   server=ThreadingHTTPServer(('127.0.0.1',0),Fixture);threading.Thread(target=server.serve_forever,daemon=True).start();store.contact_engine.extra_env={'JP_TEST_ALLOW_LOOPBACK':'1'}
   try:
    config={**c.DEFAULTS,'request_timeout':2,'municipality_timeout':30}
    data=store.contact_engine.call('/api/extract-single',{'municipio':'Tijucas','uf':'SC','website':'http://127.0.0.1:'+str(server.server_port),'maxRequests':20,'deadlineSeconds':30},config)['data'];self.assertEqual(data['presidenteNome'],'João Silva Teste');self.assertEqual(data['camaraEmail'],'camara@tijucas.example.org');self.assertTrue(data['network']['visited'])
    strict=store.contact_engine.call('/api/extract-single',{'municipio':'Tijucas','uf':'SC','website':'http://127.0.0.1:'+str(server.server_port),'maxRequests':20,'deadlineSeconds':30,'evidenceOnly':True},config)['data']
    self.assertTrue(strict['evidencePack']['pages']);self.assertTrue(strict['evidencePack']['institutional'])
    from chamber_api import collect
    normalized=collect(store,{'fields':{'Município':'Tijucas','UF':'SC'}},strict,config)
    self.assertEqual(normalized['presidenteNome'],'João Silva Teste');self.assertEqual(normalized['presidenciaModo'],'presumed');self.assertIn('(48) 3333-0000',normalized['camaraTelefoneSite'])
    with self.assertRaises(urllib.error.HTTPError) as ctx:urllib.request.urlopen('http://127.0.0.1:'+str(store.contact_engine.port)+'/api/health')
    self.assertEqual(ctx.exception.code,403)
   finally:store.contact_engine.close();server.shutdown();server.server_close()
