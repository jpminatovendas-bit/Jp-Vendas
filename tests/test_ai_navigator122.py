import sys,copy,io,json,tempfile,threading,time,unittest,urllib.error
from pathlib import Path
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import ai_navigator as nav,chamber_api as validation,contact_extractor as extractor
from app import Store
from test_flow import workbook

class AI122(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.store=Store(Path(self.tmp.name)/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS';self.root='https://camara.example.org/site';self.mesa='https://camara.example.org/conteudos/6189';self.listing='https://camara.example.org/conteudos/1111';self.profile='https://camara.example.org/conteudos/2222';self.store.save_item(self.key,{'Website Câmara':self.root,'Presidente Atual (Nome)':'Contato anterior privado'},{})
  self.store.set_setting('contact_extractor_openai_key','TEST_ONLY_SECRET');self.config={**extractor.DEFAULTS,'use_ai':True,'interval':0,'concurrency':1};self.store.set_setting('contact_extractor_config',self.config)
  footer='Câmara: (48) 3333-0000 camara@example.org';self.quote='Presidente João da Silva';profiletext='João da Silva Fone: (48) 99999-2222 joao@example.org'
  def page(url,text,links=None,primary=False,navlinks=None):return {'url':url,'title':'Câmara Municipal','text':text,'mainText':text,'links':links or [],'whatsappLinks':[],'primary':primary,'compositionPeriods':[],'presidentNames':['João da Silva'] if primary else [],'nav':navlinks or []}
  institution=[{'kind':kind,'value':value,'url':self.root,'quote':footer} for kind,value in [('phone','(48) 3333-0000'),('email','camara@example.org')]]
  self.pages={self.root:{'page':page(self.root,footer,navlinks=[{'url':self.mesa,'label':'Mesa Diretora'},{'url':self.listing,'label':'Vereadores'}]),'institutional':institution,'network':{'requests':1}},self.mesa:{'page':page(self.mesa,self.quote,primary=True,navlinks=[{'url':self.listing,'label':'Vereadores'}]),'network':{'requests':1}},self.listing:{'page':page(self.listing,'Vereadores JOAO DA SILVA',navlinks=[{'url':self.profile,'label':'JOAO DA SILVA'}]),'network':{'requests':1}},self.profile:{'page':page(self.profile,profiletext,['(48) 99999-2222','joao@example.org']),'network':{'requests':1}}}
  self.result={'president':{'name':'João da Silva','party':None,'period':None,'profile_url':self.profile,'evidence':{'url':self.mesa,'quote':self.quote},'contacts':[{'kind':kind,'value':value,'url':self.profile,'quote':profiletext} for kind,value in [('phone','(48) 99999-2222'),('email','joao@example.org')]]},'chamber':{'contacts':[],'address':None},'observacoes':[]}
  self.calls=[];self.model_payloads=[]
  self.original_engine=self.store.contact_engine
  outer=self
  class Engine:
   def ensure(self,config):pass
   def call(self,path,body,config):
    outer.assertEqual(path,'/api/ai-fetch');outer.calls.append(body);return {'data':copy.deepcopy(outer.pages[body['url']])}
  self.store.contact_engine=Engine()
 def tearDown(self):
  for event in self.store.contact_cancel.values():event.set()
  self.original_engine.close();self.tmp.cleanup()
 def decision(self,url=None,purpose='other',result=None):return {'action':'visit' if url else 'finish','url':url,'purpose':purpose,'reason':'Ler a próxima fonte' if url else 'Fontes analisadas','result':result}
 def decisions(self):return [self.decision(self.mesa,'mesa'),self.decision(self.listing,'listing'),self.decision(self.profile,'profile'),self.decision(result=self.result)]
 def run_flow(self,decisions=None,config=None,event=None):
  decisions=iter(decisions or self.decisions())
  def model(key,model,payload,timeout,instructions=None):
   self.model_payloads.append(copy.deepcopy(payload));return next(decisions),{'input_tokens':100,'output_tokens':20,'total_tokens':120}
  with patch('ai_navigator.post_openai',side_effect=model):return nav.collect_site(self.store,self.store.item(self.key),config or self.config,event)
 def test_ai_drives_every_visit_from_registered_site_without_old_contacts(self):
  r=self.run_flow();self.assertEqual([b['url'] for b in self.calls],[self.root,self.mesa,self.listing,self.profile]);self.assertEqual(r['presidenteNome'],'João da Silva');self.assertEqual(r['presidenteTelefone'],'(48) 99999-2222');self.assertEqual(r['presidenciaModo'],'presumed');self.assertIsNone(r['presidenteWhatsapp']);self.assertEqual(r['navigation']['status'],'complete');self.assertEqual(r['navigation']['api_calls'],4);self.assertEqual(r['navigation']['usage']['total_tokens'],480);self.assertNotIn('Contato anterior privado',json.dumps(self.model_payloads));self.assertNotIn('TEST_ONLY_SECRET',json.dumps(r))
 def test_outside_or_unobserved_urls_never_fetched(self):
  for url in ['https://outra-camara.example.org/presidente','https://camara.example.org/inventada']:
   self.calls=[];r=self.run_flow([self.decision(url,'profile')]);self.assertEqual(len(self.calls),1);self.assertIn('não observada',r['navigation']['stop_reason']);self.assertFalse(r['presidentWrite']);self.assertEqual(r['camaraEmail'],'camara@example.org')
 def test_repeated_page_stops_without_loop(self):
  r=self.run_flow([self.decision(self.root)]);self.assertEqual(len(self.calls),1);self.assertIn('repetiu',r['navigation']['stop_reason'])
 def test_api_failure_preserves_old_president_but_saves_institutional(self):
  with patch('ai_navigator.post_openai',side_effect=ValueError('OpenAI HTTP 401: chave inválida')):r=nav.collect_site(self.store,self.store.item(self.key),self.config)
  self.assertFalse(r['presidentWrite']);extractor.apply_result(self.store,self.key,r);item=self.store.item(self.key);self.assertEqual(item['fields']['Presidente Atual (Nome)'],'Contato anterior privado');self.assertIn('camara@example.org',item['fields']['Email Geral da Câmara']);self.assertEqual(item['local']['extractor']['state'],'partial');self.assertIn('401',item['local']['extractor']['navigation']['stop_reason'])
 def test_cancel_does_not_apply_data(self):
  event=threading.Event();event.set()
  with self.assertRaises(nav.Cancelled):self.run_flow(event=event)
  self.assertFalse(self.calls);self.assertEqual(self.store.item(self.key)['fields']['Presidente Atual (Nome)'],'Contato anterior privado')
 def test_step_and_page_budget_are_enforced(self):
  r=self.run_flow(config={**self.config,'ai_steps':2});self.assertEqual(r['navigation']['api_calls'],2);self.assertIn('etapas',r['navigation']['stop_reason'])
  self.calls=[];r=self.run_flow(config={**self.config,'ai_pages':1});self.assertEqual(len(self.calls),1);self.assertIn('páginas',r['navigation']['stop_reason'])
 def test_root_failure_reports_error_without_calling_ai(self):
  self.pages[self.root]={'page':None,'network':{'requests':1,'failures':['HTTP 503']}};r=self.run_flow();self.assertEqual(r['navigation']['status'],'error');self.assertEqual(r['navigation']['api_calls'],0);self.assertFalse(r['presidentWrite']);self.assertIn('HTTP 503',r['navigation']['failures'])
 def test_finish_without_result_is_not_success(self):
  r=self.run_flow([self.decision()]);self.assertEqual(r['navigation']['status'],'partial');self.assertIn('sem fornecer',r['navigation']['stop_reason'])
 def test_complete_without_accepted_data_is_no_data(self):
  self.pages[self.root]['institutional']=[];empty={'president':{},'chamber':{'contacts':[],'address':None},'observacoes':[]};r=self.run_flow([self.decision(result=empty)]);self.assertEqual(r['navigation']['status'],'no_data');self.assertFalse(r['presidenciaAceita'])
 def test_http_payload_and_sanitized_api_errors(self):
  answer=self.decision(result=self.result);reply={'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(answer)}]}],'usage':{'total_tokens':12}}
  with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(reply).encode())) as post:
   result,usage=nav.post_openai('TEST_ONLY_SECRET','gpt-4.1-mini',{'site_inicial':self.root},30);body=json.loads(post.call_args.args[0].data);self.assertFalse(body['store']);self.assertTrue(body['text']['format']['strict']);self.assertEqual(result['action'],'finish');self.assertEqual(usage['total_tokens'],12)
  error=urllib.error.HTTPError('https://api.openai.com/v1/responses',429,'Erro',{},io.BytesIO(json.dumps({'error':{'code':'insufficient_quota','message':'TEST_ONLY_SECRET'}}).encode()))
  with patch('urllib.request.urlopen',side_effect=error):
   with self.assertRaises(ValueError) as caught:nav.post_openai('TEST_ONLY_SECRET','gpt-4.1-mini',{},30)
  self.assertIn('saldo/cota',str(caught.exception));self.assertNotIn('TEST_ONLY_SECRET',str(caught.exception))
 def test_incomplete_and_refusal_are_reported(self):
  for reply in [{'status':'incomplete'},{'status':'completed','output':[{'type':'message','content':[{'type':'refusal'}]}]}]:
   with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(reply).encode())):
    with self.assertRaises(ValueError):nav.post_openai('TEST_ONLY_SECRET','gpt-4.1-mini',{},10)
 def test_real_queue_uses_new_flow_and_persists_diagnostic(self):
  decisions=iter(self.decisions())
  with patch('ai_navigator.post_openai',side_effect=lambda *args:(next(decisions),{'input_tokens':1,'output_tokens':1,'total_tokens':2})):
   jid=extractor.start(self.store,[self.key],'extract','IA exclusiva')['job'];end=time.time()+5
   while extractor.job(self.store,jid)['status']=='running' and time.time()<end:time.sleep(.02)
  job=extractor.job(self.store,jid);self.assertEqual(job['items'][0]['state'],'done');self.assertIn('4 chamadas IA',job['items'][0]['message']);item=self.store.item(self.key);self.assertEqual(item['fields']['Presidente Atual (Nome)'],'João da Silva');self.assertEqual(item['local']['extractor']['navigation']['mode'],'ai_navigation');self.assertEqual(item['local']['extractor']['navigation']['status'],'complete')

class Reader122(unittest.TestCase):
 def test_real_node_page_reader_links_contacts_security_and_no_legacy_rules(self):
  class Site(BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_GET(self):
    if self.path=='/redirect':self.send_response(302);self.send_header('Location','http://localhost:'+str(self.server.server_port)+'/other');self.end_headers();return
    raw='<html><title>Câmara Municipal</title><body><nav><a href="/site/conteudos/6189">Mesa Diretora</a><a href="https://outra.example.org">Outra</a></nav><main><h1>Presidente</h1><p>Presidente Diogo Samuel Ritter (PP)</p><p>Legislatura 2025–2028</p><a href="tel:+55(55)99671-6650">Fone</a></main><footer><a href="mailto:camara@example.org">camara@example.org</a><p>(55) 2211-0081</p></footer></body></html>'.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(raw)
  with tempfile.TemporaryDirectory() as tmp:
   store=Store(Path(tmp)/'dados')
   if not store.contact_engine.available()['ready']:self.skipTest('Motor Node não instalado')
   server=ThreadingHTTPServer(('127.0.0.1',0),Site);threading.Thread(target=server.serve_forever,daemon=True).start();store.contact_engine.extra_env={'JP_TEST_ALLOW_LOOPBACK':'1'};root='http://127.0.0.1:'+str(server.server_port);config={**extractor.DEFAULTS,'request_timeout':2,'municipality_timeout':30}
   try:
    result=store.contact_engine.call('/api/ai-fetch',{'rootUrl':root,'url':root,'maxRequests':5},config)['data'];self.assertTrue(result['page']['primary']);self.assertIn('Diogo Samuel Ritter',result['page']['mainText']);self.assertEqual(len(result['page']['nav']),1);self.assertTrue(result['page']['nav'][0]['url'].endswith('/6189'));self.assertIn('(55) 99671-6650',result['page']['links']);self.assertTrue(result['institutional']);self.assertFalse(result['page']['compositionPeriods'])
    failed=store.contact_engine.call('/api/ai-fetch',{'rootUrl':root,'url':root+'/redirect','maxRequests':5},config)['data'];self.assertIsNone(failed['page']);self.assertTrue(any('fora do site' in x for x in failed['network']['failures']))
    with self.assertRaises(ValueError):store.contact_engine.call('/api/ai-fetch',{'rootUrl':root,'url':'https://outra.example.org/'},config)
   finally:store.contact_engine.close();server.shutdown();server.server_close()
