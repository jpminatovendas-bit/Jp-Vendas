import copy,json,threading,unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import test_chamber_api120 as old
import chamber_api as api,contact_extractor as extractor

class Chamber121(unittest.TestCase):
 def setUp(self):
  old.Chamber120.setUp(self)
  self.result['president']['period']=None
  self.quote='Mesa Diretora. Presidente João da Silva.'
  self.result['president']['evidence']={'url':self.url,'quote':self.quote}
  self.pack['pages'][0].update(text=self.quote,mainText=self.quote,role='mesa')
  self.pack.update(primaryMesaUrls=[self.url],compositionPeriods=[],multipleCompositions=False)
 def tearDown(self):old.Chamber120.tearDown(self)
 def result_now(self):return api.enforce(self.result,self.pack)
 def test_single_undated_main_mesa_presumed_with_personal_contacts(self):
  r=self.result_now();self.assertEqual(r['presidenciaModo'],'presumed');self.assertFalse(r['presidenciaConfirmada']);self.assertEqual(r['presidenteNome'],'João da Silva');self.assertEqual(r['presidenteTelefone'],'(48) 99999-2222');self.assertIsNone(r['presidentePeriodo']);self.assertIn(api.PRESUMED,r['observacoes'])
 def test_explicit_old_composition_not_presumed_even_if_model_omits_period(self):
  for periods in (['2022'],['2025'],['2023-2024']):
   self.pack['compositionPeriods']=periods;self.assertIsNone(self.result_now()['presidenteNome'])
 def test_explicit_historical_route_cannot_be_presumed(self):
  oldurl=self.url+'/mesa-diretora-2024';self.pack['pages'][0]['url']=oldurl;self.pack['primaryMesaUrls']=[oldurl];self.result['president']['evidence']['url']=oldurl;self.assertIsNone(self.result_now()['presidenteNome'])
 def test_multiple_compositions_require_reference_year(self):
  self.pack.update(compositionPeriods=['2024','2026'],multipleCompositions=True);self.assertIsNone(self.result_now()['presidenteNome'])
  quote='Mesa Diretora 2026. Presidente João da Silva.';self.pack['pages'][0].update(text=quote,mainText=quote);self.result['president'].update(period='2026',evidence={'url':self.url,'quote':quote});self.assertEqual(self.result_now()['presidenciaModo'],'confirmed')
 def test_legislature_publication_and_footer_do_not_block_undated_mesa(self):
  text='Presidente\nPublicado em: 08/01/2025\nPresidente João da Silva\nLegislatura 2025 - 2028\nCopyright 2026';self.pack['pages'][0].update(text=text,mainText=text);self.result['president']['evidence']['quote']='Presidente João da Silva';self.assertEqual(self.result_now()['presidenciaModo'],'presumed')
 def test_profile_or_news_alone_is_not_main_mesa(self):
  for role in ('profile','news','other'):
   self.pack['pages'][0]['role']=role;self.assertIsNone(self.result_now()['presidenteNome'])
 def test_vice_and_unbound_name_rejected(self):
  for quote in ('Mesa Diretora. Vice-presidente João da Silva.','Presidente Outra Pessoa. João da Silva.'):
   self.pack['pages'][0]['text']=quote;self.pack['pages'][0]['mainText']=quote;self.result['president']['evidence']['quote']=quote
   self.assertIsNone(self.result_now()['presidenteNome'])
  self.pack['primaryMesaUrls']=[];self.assertIsNone(self.result_now()['presidenteNome'])
 def test_duplicate_institutional_still_removed_with_presumed_president(self):
  self.result['president']['contacts'].append({'kind':'email','value':'camara@example.org','url':self.home,'quote':self.pack['pages'][2]['text']});r=self.result_now();self.assertEqual(r['presidenteEmail'],'joao@example.org');self.assertIn(api.DUPLICATE,r['observacoes'])
 def test_persist_mode_and_evidence_without_inventing_year(self):
  extractor.apply_result(self.store,self.key,self.result_now());item=self.store.item(self.key);self.assertEqual(item['local']['presidency_validation']['mode'],'presumed');self.assertFalse(item['local']['presidency_validation']['confirmed']);self.assertEqual(item['fields']['Presidente Atual (Nome)'],'João da Silva');self.assertFalse(item['fields']['Presidente - Período Mandato'])
 def test_real_mesa_name_to_vereadores_to_profile_and_direct_profile(self):
  class Site(BaseHTTPRequestHandler):
   mode='listing'
   def log_message(self,*args):pass
   def do_GET(self):
    if self.path=='/':body='<h1>Câmara Municipal de Tijucas SC</h1><a href="/mesa-diretora">Mesa Diretora</a><a href="/vereadores">Vereadores</a>'
    elif self.path=='/mesa-diretora':
     body='<h1>Mesa Diretora'+(' 2024' if self.mode=='old' else '')+'</h1><p>Presidente: João da Silva</p><p>Vice-presidente: Pedro Outros</p>'
     if self.mode=='direct':body+='<p>Fone: (48) 99999-2222</p><a href="mailto:joao@example.org">joao@example.org</a>'
    elif self.path=='/vereadores':body='<h1>Vereadores</h1><a href="/vereador/joao">JOAO DA SILVA</a><a href="/vereador/junior">João da Silva Junior</a>'
    elif self.path=='/vereador/joao':body='<h1>João da Silva</h1><p>Legislatura 2025–2028</p><p>Fone: (48) 99999-2222</p><a href="mailto:joao@example.org">joao@example.org</a>'
    else:self.send_error(404);return
    if self.path=='/vereadores' and self.mode=='ambiguous':body+='<a href="/vereador/outro-joao">João da Silva</a>'
    raw=('<html><title>Câmara Municipal de Tijucas SC</title><body><main>'+body+'</main><footer><p>Câmara: (48) 3333-0000</p><a href="mailto:camara@example.org">camara@example.org</a></footer></body></html>').encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(raw)
  if not self.store.contact_engine.available()['ready']:self.skipTest('Motor Node não instalado')
  server=ThreadingHTTPServer(('127.0.0.1',0),Site);threading.Thread(target=server.serve_forever,daemon=True).start();self.store.contact_engine.extra_env={'JP_TEST_ALLOW_LOOPBACK':'1'}
  try:
   config={**extractor.DEFAULTS,'request_timeout':2,'municipality_timeout':40}
   for mode in ('listing','direct','old','ambiguous'):
    Site.mode=mode;raw=self.store.contact_engine.call('/api/extract-single',{'municipio':'Tijucas','uf':'SC','website':'http://127.0.0.1:'+str(server.server_port),'evidenceOnly':True,'maxRequests':35,'deadlineSeconds':40,'referenceYear':2026},config)['data'];r=api.collect(self.store,self.store.item(self.key),raw,config)
    if mode=='old':self.assertIsNone(r['presidenteNome']);continue
    if mode=='ambiguous':
     self.assertFalse(raw['evidencePack']['presidentProfileUrl']);self.assertIsNone(r['presidenteTelefone']);continue
    self.assertEqual(r['presidenteNome'],'João da Silva',json.dumps(raw,ensure_ascii=False));self.assertEqual(r['presidenciaModo'],'presumed');self.assertIn('99999-2222',r['presidenteTelefone']);self.assertEqual(r['presidenteEmail'],'joao@example.org');self.assertIsNone(r['presidenteWhatsapp']);self.assertEqual(r['camaraEmail'],'camara@example.org')
    if mode=='listing':self.assertTrue(raw['evidencePack']['presidentProfileUrl'].endswith('/vereador/joao'));self.assertTrue(any(u.endswith('/vereadores') for u in raw['network']['visited']))
  finally:server.shutdown();server.server_close()
