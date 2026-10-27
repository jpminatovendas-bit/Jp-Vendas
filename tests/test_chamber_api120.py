import copy,io,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import chamber_api as api,contact_extractor as extractor
from app import Store
from test_flow import workbook

class Chamber120(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.store=Store(Path(self.tmp.name)/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS';self.url='https://camara.example.org/mesa';self.profile='https://camara.example.org/joao';self.home='https://camara.example.org/'
  self.quote='Mesa Diretora 2025–2026. Presidente João da Silva.'
  self.contact='João da Silva: telefone (48) 99999-2222, e-mail joao@example.org, WhatsApp (48) 99999-3333.'
  footer='Câmara Municipal: (48) 3333-0000 camara@example.org WhatsApp (48) 99999-1111'
  self.pack={'workingUrl':self.home,'presidentProfileUrl':self.profile,'pages':[{'url':self.url,'text':self.quote,'links':[]},{'url':self.profile,'text':self.contact,'links':[]},{'url':self.home,'text':footer,'links':[]}], 'institutional':[{'kind':k,'value':v,'url':self.home,'quote':footer} for k,v in [('phone','(48) 3333-0000'),('email','camara@example.org'),('whatsapp','(48) 99999-1111')]]}
  self.result={'president':{'name':'João da Silva','party':None,'period':'2025–2026','profile_url':self.profile,'evidence':{'url':self.url,'quote':self.quote},'contacts':[{'kind':k,'value':v,'url':self.profile,'quote':self.contact} for k,v in [('phone','(48) 99999-2222'),('email','joao@example.org'),('whatsapp','(48) 99999-3333')]]},'chamber':{'contacts':[],'address':None},'observacoes':[]}
 def tearDown(self):self.store.contact_engine.close();self.tmp.cleanup()
 def run_result(self):return api.enforce(self.result,self.pack)
 def test_current_biennium_and_single_year(self):
  r=self.run_result();self.assertTrue(r['presidenciaConfirmada']);self.assertEqual(r['presidenteEmail'],'joao@example.org')
  quote='Mesa Diretora 2026. Presidente João da Silva.';self.pack['pages'][0]['text']=quote;self.result['president'].update(period='2026',evidence={'url':self.url,'quote':quote});self.assertTrue(self.run_result()['presidenciaConfirmada'])
 def test_old_years_never_accepted_and_chamber_still_collected(self):
  for year in (2022,2023,2024,2025):
   result=copy.deepcopy(self.result);result['president']['period']=str(year);r=api.enforce(result,self.pack);self.assertIsNone(r['presidenteNome']);self.assertIsNone(r['presidenteTelefone']);self.assertIsNone(r['presidenteEmail']);self.assertIn(api.MISSING,r['observacoes']);self.assertEqual(r['camaraEmail'],'camara@example.org')
 def test_legislature_footer_updated_year_not_proof(self):
  for quote,period in [('Legislatura 2025–2028. Presidente João da Silva. Rodapé 2026.','2025–2028'),('Presidente João da Silva. Atualização 2026.','2026'),('Presidente João da Silva. Copyright 2026.','2026')]:
   self.pack['pages'][0]['text']=quote;self.result['president'].update(period=period,evidence={'url':self.url,'quote':quote});self.assertFalse(self.run_result()['presidenciaConfirmada'])
 def test_vice_unvisited_and_mixed_evidence_rejected(self):
  for quote in ['Mesa Diretora 2026. Vice-presidente João da Silva.','Mesa Diretora 2026. Presidente Outra Pessoa. Vice-presidente João da Silva.','Mesa Diretora 2026. Mesa Diretora 2022. Presidente João da Silva.']:
   self.pack['pages'][0]['text']=quote;self.result['president'].update(period='2026',evidence={'url':self.url,'quote':quote});self.assertFalse(self.run_result()['presidenciaConfirmada'])
  self.result['president']['evidence']={'url':'https://fake.example.org/','quote':self.quote};self.assertFalse(self.run_result()['presidenciaConfirmada'])
 def test_duplicate_phone_email_whatsapp_only_removed(self):
  self.pack['pages'][1]['links']=['+55 (48) 3333-0000','CAMARA@example.org','https://api.whatsapp.com/send?phone=5548999991111&text=Outro']
  for kind,value in zip(['phone','email','whatsapp'],self.pack['pages'][1]['links']):self.result['president']['contacts'].append({'kind':kind,'value':value,'url':self.profile,'quote':self.contact})
  r=self.run_result();self.assertEqual(r['presidenteTelefone'],'(48) 99999-2222');self.assertEqual(r['presidenteEmail'],'joao@example.org');self.assertEqual(r['presidenteWhatsapp'],'(48) 99999-3333');self.assertEqual(r['observacoes'].count(api.DUPLICATE),1)
 def test_phone_and_whatsapp_compare_across_kinds(self):
  atom={'kind':'whatsapp','value':'https://wa.me/554833330000?text=Oi%20presidente','url':self.profile,'quote':self.contact};self.pack['pages'][1]['links'].append(atom['value']);self.result['president']['contacts']=[atom];r=self.run_result();self.assertIsNone(r['presidenteWhatsapp']);self.assertIn(api.DUPLICATE,r['observacoes'])
 def test_contact_requires_personal_binding(self):
  self.result['president']['contacts']=[{'kind':'email','value':'camara@example.org','url':self.home,'quote':self.pack['pages'][2]['text']}];self.assertIsNone(self.run_result()['presidenteEmail'])
 def test_db_unconfirmed_clears_president_archives_old_without_manual_activity(self):
  self.store.save_item(self.key,{'Presidente - Email':'anterior@example.org'},{'phone_status':{'presidente':{'5548999998888':{'whatsapp_verified':True}}},'whatsapp_links':{'presidente':{'5548999998888':{'url':'https://wa.me/5548999998888'}}}});self.result['president']['period']='2022';extractor.apply_result(self.store,self.key,self.run_result());item=self.store.item(self.key)
  self.assertEqual(item['fields']['Presidente Atual (Nome)'],'');self.assertEqual(item['fields']['Presidente - Email'],'');self.assertTrue(item['local']['president_extraction_history']);self.assertFalse(item['local']['presidency_validation']['confirmed']);self.assertFalse(item['local']['phone_status']['presidente']);self.assertFalse(item['local']['whatsapp_links']['presidente']);self.assertNotIn('last_manual_edit_at',item['local']);self.assertIn('camara@example.org',item['fields']['Email Geral da Câmara'])
 def test_compare_existing_institutional_database_contacts(self):
  self.store.save_item(self.key,{'Email Geral da Câmara':'joao@example.org'},{});extractor.apply_result(self.store,self.key,self.run_result());item=self.store.item(self.key);self.assertEqual(item['fields']['Presidente - Email'],'');self.assertIn(api.DUPLICATE,item['local']['presidency_validation']['observacoes'])
 def test_openai_request_schema_no_key_exposure(self):
  self.store.set_setting('contact_extractor_openai_key','TEST_ONLY_SECRET');reply={'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(self.result)}]}]}
  with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(reply).encode())) as post:
   r=api.collect(self.store,self.store.item(self.key),{'evidencePack':self.pack},{**extractor.DEFAULTS,'use_ai':True});self.assertTrue(r['aiUsed']);self.assertTrue(r['presidenciaConfirmada']);request=post.call_args.args[0];body=json.loads(request.data);self.assertFalse(body['store']);self.assertTrue(body['text']['format']['strict']);self.assertNotIn('TEST_ONLY_SECRET',json.dumps(r));self.assertEqual(request.full_url,'https://api.openai.com/v1/responses')
 def test_api_refusal_incomplete_keep_only_institutional(self):
  self.store.set_setting('contact_extractor_openai_key','TEST_ONLY_SECRET')
  for reply in ({'status':'incomplete','output':[]},{'status':'completed','output':[{'type':'message','content':[{'type':'refusal'}]}]}):
   with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(reply).encode())):
    r=api.collect(self.store,self.store.item(self.key),{'evidencePack':self.pack},{**extractor.DEFAULTS,'use_ai':True});self.assertFalse(r['aiUsed']);self.assertIsNone(r['presidenteNome']);self.assertEqual(r['camaraEmail'],'camara@example.org');self.assertIn(api.MISSING,r['observacoes'])
 def test_settings_mask_separate_keys_and_reference_year(self):
  extractor.save_settings(self.store,{**extractor.DEFAULTS,'use_ai':True,'api_key':'TEST_ONLY_SECRET'});public=extractor.public_config(self.store);self.assertTrue(public['key_present']);self.assertNotIn('TEST_ONLY_SECRET',json.dumps(public));self.assertEqual(public['config']['reference_year'],2026)
  with self.assertRaises(ValueError):extractor.save_settings(self.store,{'reference_year':1900})
