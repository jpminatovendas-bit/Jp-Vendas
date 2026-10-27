import copy,json,sys,tempfile,threading,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app,extractor_prompt as prompt,chamber_api as v,ai_navigator as nav
import test_ai_navigator122 as fixtures
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler

class Calibration123(unittest.TestCase):
 def fixture(self,quote='Marcon Marcelo Pilger / Vereador em Exercicio / Presidente',url='https://camara.example.org/mesa-diretora-camara/'):
  page={'url':url,'title':'Mesa Diretora','text':quote,'mainText':quote,'role':'mesa'}
  pres={'name':'Marcon Marcelo Pilger','period':None,'evidence':{'url':url,'quote':quote},'contacts':[]}
  return pres,{'pages':[page],'primaryMesaUrls':[url],'compositionPeriods':[]}
 def test_name_before_cargo_is_current_and_old_bio_does_not_override(self):
  p,pack=self.fixture();pack['pages'].append({'url':'https://camara.example.org/vereadores/marcon/','text':'Marcon Marcelo Pilger / Presidente\nBiografia: VICE-PRESIDENTE. Fone (55) 99605-2866','links':['(55) 99605-2866']});p['profile_url']=pack['pages'][1]['url'];pack['presidentProfileUrl']=p['profile_url'];p['contacts']=[{'kind':'phone','value':'(55) 99605-2866','url':pack['pages'][1]['url']}]
  r=v.enforce({'president':p,'chamber':{'contacts':[]},'observacoes':['Biografia divergente: vice; Mesa principal e título indicam Presidente.']},pack)
  self.assertTrue(r['presidenciaAceita']);self.assertEqual(r['presidenteNome'],p['name']);self.assertEqual(r['presidenteTelefone'],'(55) 99605-2866');self.assertIsNone(r['presidenteWhatsapp']);self.assertEqual(r['presidenciaModo'],'presumed')
 def test_vice_and_cropped_vice_not_accepted(self):
  for separator in ['-',' ','–','—','‑']:
   p,pack=self.fixture('Vice'+separator+'Presidente Marcon Marcelo Pilger')
   self.assertFalse(v.named_president(p,v.page_map(pack)))
   p['evidence']['quote']='Presidente Marcon Marcelo Pilger'
   self.assertFalse(v.named_president(p,v.page_map(pack)))
 def test_news_document_history_and_commission_not_proof_even_with_year(self):
  for path in ['/noticias/mesa-diretora-2026','/documentos/ata-2026','/wp-content/uploads/ata.pdf','/ex-presidentes/mesa-diretora','/comissoes/presidente']:
   p,pack=self.fixture('Mesa Diretora 2026 Presidente Marcon Marcelo Pilger','https://camara.example.org'+path);p['period']='2026'
   self.assertFalse(v.period_proven(p,v.page_map(pack),2026),path)
 def test_home_and_roster_explicit_role_without_year(self):
  for role in ['home','roster']:
   p,pack=self.fixture();pack['pages'][0]['role']=role
   self.assertTrue(v.presumed_current(p,pack,v.page_map(pack)))
 def test_neighbor_name_is_not_president(self):
  p,pack=self.fixture('Presidente Renato Andre Both Marcon Marcelo Pilger / Vereador em Exercicio')
  self.assertFalse(v.named_president(p,v.page_map(pack)))
 def test_old_or_multiple_composition_not_presumed(self):
  for quote in ['Mesa Diretora 2024 Presidente Marcon Marcelo Pilger','Mesa Diretora Presidente Marcon Marcelo Pilger']:
   p,pack=self.fixture(quote)
   if '2024' not in quote:pack['multipleCompositions']=True
   self.assertFalse(v.presumed_current(p,pack,v.page_map(pack)))

class Prompt123(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.store=app.Store(Path(self.tmp.name)/'dados')
 def tearDown(self):self.store.contact_engine.close();self.tmp.cleanup()
 def save(self,text,rev):return prompt.save(self.store,{'prompt':text,'expected_revision':rev})
 def test_persistence_history_reset_restore_and_conflict(self):
  original=prompt.snapshot(self.store);text=original['prompt']+'\nTeste pessoal de calibração.';a=self.save(text,0);self.assertTrue(a['custom']);self.assertEqual(a['revision'],1)
  reopened=app.Store(Path(self.tmp.name)/'dados')
  try:self.assertEqual(prompt.snapshot(reopened)['prompt'],text)
  finally:reopened.contact_engine.close()
  self.assertEqual(self.save(text,1)['revision'],1)
  with self.assertRaisesRegex(ValueError,'outra janela'):self.save(text+' novo',0)
  b=prompt.save(self.store,{'action':'reset','expected_revision':1});self.assertFalse(b['custom']);self.assertEqual(b['revision'],2)
  c=prompt.save(self.store,{'action':'restore','expected_revision':2,'restore_revision':1});self.assertEqual(c['prompt'],text);self.assertEqual(c['revision'],3)
  with patch('extractor_prompt.DEFAULT_STRATEGY','Novo padrão de versão futura'):self.assertEqual(prompt.snapshot(self.store)['prompt'],text)
 def test_invalid_lengths_and_running_queue_preserve_prompt(self):
  for text in ['abc','x'*20001]:
   with self.assertRaises(ValueError):self.save(text,0)
  with self.store.connect() as db:db.execute('INSERT INTO contact_jobs(id,value) VALUES (?,?)',('running123',json.dumps({'status':'running'})))
  with self.assertRaisesRegex(ValueError,'fila'):self.save('Meu prompt de teste com vinte caracteres',0)
  self.assertEqual(prompt.snapshot(self.store)['revision'],0)
 def test_core_and_model_instructions_use_saved_prompt(self):
  text='Colete apenas fontes principais. Minha calibração local.';self.save(text,0);state=prompt.snapshot(self.store);instructions=prompt.build_prompt(state['prompt'])
  self.assertIn(text,instructions);self.assertIn('PROTOCOLO FIXO',instructions)
  import io
  answer={'action':'finish','url':None,'purpose':'other','reason':'Teste','result':{'president':{},'chamber':{'contacts':[]},'observacoes':[]}}
  reply={'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(answer)}]}]}
  with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(reply).encode())) as call:
   nav.post_openai('TEST_ONLY','gpt-4.1-mini',{},10,instructions)
   self.assertEqual(json.loads(call.call_args.args[0].data)['instructions'],instructions)

class Flow123(unittest.TestCase):
 setUp=fixtures.AI122.setUp
 tearDown=fixtures.AI122.tearDown
 decision=fixtures.AI122.decision
 decisions=fixtures.AI122.decisions
 run_flow=fixtures.AI122.run_flow
 def test_prompt_revision_in_flow_and_ignored_document_links(self):
  text=prompt.DEFAULT_STRATEGY+'\nMinha instrução de teste123.';prompt.save(self.store,{'prompt':text,'expected_revision':0})
  decisions=iter(self.decisions());seen=[]
  def model(*args):seen.append(args[4]);return next(decisions),{}
  with patch('ai_navigator.post_openai',side_effect=model):r=nav.collect_site(self.store,self.store.item(self.key),self.config)
  self.assertEqual(r['navigation']['prompt_revision'],1);self.assertEqual(r['navigation']['prompt_source'],'custom');self.assertTrue(all(text in s for s in seen))
  self.pages[self.root]['page']['nav'].append({'url':'https://camara.example.org/noticias/ata','label':'Presidente'})
  r=self.run_flow([self.decision('https://camara.example.org/noticias/ata','mesa')]);self.assertIn('não observada',r['navigation']['stop_reason'])


class Reader123(unittest.TestCase):
 def test_real_reader_name_before_role_and_old_documents_not_in_route(self):
  class Site(BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_GET(self):
    html='''<html><title>Mesa Diretora</title><body><nav><a href="/mesa-diretora-camara/">Mesa Diretora</a><a href="/noticias/mesa-diretora-2024">Mesa Diretora 2024</a><a href="/documentos/ata.pdf">Presidente em 2022</a><a href="/ex-presidentes/">Ex-presidentes</a></nav><main><div><a href="/vereadores/marcon-marcelo-pilger/">Marcon Marcelo Pilger</a>/ Vereador em Exercicio/ Presidente</div><div>Renato Andre Both / Vereador em Exercicio/ Vice-Presidente</div></main><footer>Fone (55) 2032-0043</footer></body></html>'''
    self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(html.encode())
  with tempfile.TemporaryDirectory() as tmp:
   store=app.Store(Path(tmp)/'dados');server=ThreadingHTTPServer(('127.0.0.1',0),Site);threading.Thread(target=server.serve_forever,daemon=True).start();root='http://127.0.0.1:'+str(server.server_port);store.contact_engine.extra_env={'JP_TEST_ALLOW_LOOPBACK':'1'}
   try:
    import contact_extractor
    config={**contact_extractor.DEFAULTS,'request_timeout':2,'municipality_timeout':30}
    page=store.contact_engine.call('/api/ai-fetch',{'rootUrl':root,'url':root,'maxRequests':5},config)['data']['page']
    self.assertTrue(page['primary']);self.assertEqual(page['presidentNames'],['Marcon Marcelo Pilger']);self.assertEqual(page['compositionPeriods'],[]);self.assertEqual(len(page['nav']),2);self.assertFalse(any('noticias' in n['url'] or '.pdf' in n['url'] or 'ex-presidentes' in n['url'] for n in page['nav']))
   finally:store.contact_engine.close();server.shutdown();server.server_close()

if __name__=='__main__':unittest.main()
