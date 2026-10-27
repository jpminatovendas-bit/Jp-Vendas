import copy,unittest
import chamber_api as v
class Presidency1232(unittest.TestCase):
 def setUp(self):
  self.url='https://camara.example.org/site/conteudos/1680-ppresidentep';self.quote='Presidente em Exercício / 2026\nVereadora - Micheli Vargas PDT';self.text=self.quote+'\nFone: (55) 9.9166-5758';self.page={'url':self.url,'title':'Câmara Municipal','text':self.text,'mainText':self.text,'role':'mesa','links':[]};self.pack={'pages':[self.page],'primaryMesaUrls':[self.url],'compositionPeriods':['2026']};self.pres={'name':'Micheli Vargas','party':'PDT','period':'2026','profile_url':self.url,'evidence':{'url':self.url,'quote':self.quote},'contacts':[{'kind':'phone','value':'(55) 99166-5758','url':self.url,'quote':self.text}]}
 def result(self):return v.enforce({'president':self.pres,'chamber':{'contacts':[]},'observacoes':[]},self.pack,2026)
 def test_year_between_role_and_name_and_dotted_mobile(self):
  r=self.result();self.assertTrue(r['presidenciaConfirmada']);self.assertEqual(r['presidenteNome'],'Micheli Vargas');self.assertEqual(r['presidenteTelefone'],'(55) 99166-5758');self.assertIsNone(r['presidenteWhatsapp']);self.assertEqual(r['presidenciaDiagnostico']['mode'],'confirmed')
 def test_old_period_vice_and_neighbor_not_accepted(self):
  for q,period in [('Vice-Presidente em Exercício / 2026 Vereadora - Micheli Vargas','2026'),('Presidente em Exercício / 2024 Vereadora - Micheli Vargas','2024'),('Presidente em Exercício / 2026 Vereador João Outro Secretária Micheli Vargas','2026')]:
   self.page['text']=self.page['mainText']=q;self.pres['evidence']['quote']=q;self.pres['period']=period;self.assertFalse(self.result()['presidenciaAceita'],q)
 def test_publication_date_and_legislature_do_not_prove_presidency(self):
  for q in ['Presidente Micheli Vargas Publicado em 2026','Presidente Micheli Vargas Legislatura 2025-2028']:
   self.page['text']=self.page['mainText']=q;self.pres['evidence']['quote']=q;self.assertFalse(self.result()['presidenciaAceita'],q)
 def test_missing_candidate_and_rejected_literal_have_different_reasons(self):
  self.pres['name']=None;self.assertIn('não retornou nome',self.result()['presidenciaDiagnostico']['reasons'][0]);self.pres['name']='Micheli Vargas';self.pres['evidence']['quote']='Trecho que não existe';r=self.result();self.assertIn('literalmente',r['presidenciaDiagnostico']['reasons'][0]);self.assertEqual(r['presidenciaDiagnostico']['candidate_name'],'Micheli Vargas')
 def test_formatted_phone_still_rejects_wrong_number(self):
  a=self.pres['contacts'][0];self.assertTrue(v.contact_proven(a,{self.url:self.page}));a['value']='(55) 99999-0000';self.assertFalse(v.contact_proven(a,{self.url:self.page}))

class DirectPresidencyFlow1232(unittest.TestCase):
 def test_president_link_used_as_mesa_also_proves_personal_contact(self):
  import test_ai_navigator122 as f
  case=f.AI122();case.setUp()
  try:
   quote='Presidente em Exercício / 2026\nVereadora - Micheli Vargas PDT'
   case.pages[case.root]['page']['nav']=[{'url':case.mesa,'label':'PRESIDENTE'}]
   page=case.pages[case.mesa]['page'];page.update(text=quote+'\nFone: (48) 9.9999-2222',mainText=quote+'\nFone: (48) 9.9999-2222',primary=True,presidentNames=[],compositionPeriods=['2026'])
   result={'president':{'name':'Micheli Vargas','party':'PDT','period':'2026','profile_url':case.mesa,'evidence':{'url':case.mesa,'quote':quote},'contacts':[{'kind':'phone','value':'(48) 99999-2222','url':case.mesa,'quote':'Fone: (48) 9.9999-2222'}]},'chamber':{'contacts':[]},'observacoes':[]}
   out=case.run_flow([case.decision(case.mesa,'mesa'),case.decision(result=result)])
   self.assertTrue(out['presidenciaConfirmada']);self.assertEqual(out['presidenteTelefone'],'(48) 99999-2222');self.assertTrue(out['navigation']['validation']['name_role_link']);self.assertEqual(out['navigation']['pages'][1]['role'],'presidency')
  finally:case.tearDown()
