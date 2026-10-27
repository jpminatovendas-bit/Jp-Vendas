import copy,json,unittest
import ai_navigator as nav
import test_ai_navigator122 as fixture
class Navigation1233(unittest.TestCase):
 setUp=fixture.AI122.setUp
 tearDown=fixture.AI122.tearDown
 decision=fixture.AI122.decision
 decisions=fixture.AI122.decisions
 run_flow=fixture.AI122.run_flow
 def configure(self):
  page=self.pages[self.mesa]['page'];page.update(primary=False,mainText='Conteúdo curto sem título',title='Mesa Diretora - Câmara Municipal');page['nav']=[{'url':self.profile,'label':'João da Silva/ Vereador em Exercício/ Presidente'}]
 def test_exact_failure_primary_false_now_accepts_and_follows_profile(self):
  self.configure();r=self.run_flow([self.decision(self.mesa,'mesa'),self.decision(result=self.result),self.decision(result=self.result)])
  self.assertEqual(r['presidenteNome'],'João da Silva');self.assertEqual(r['presidenteTelefone'],'(48) 99999-2222');self.assertEqual(r['presidenciaModo'],'presumed');self.assertEqual(r['navigation']['status'],'complete');self.assertEqual([x['url'] for x in self.calls],[self.root,self.mesa,self.profile]);self.assertEqual(r['navigation']['pages'][1]['primary'],False);self.assertEqual(r['navigation']['pages'][1]['role'],'mesa');self.assertEqual(r['navigation']['pages'][1]['primary_reason'],'observed_menu_or_mesa_page');self.assertEqual(r['navigation']['steps'][1]['action'],'finish_deferred')
 def test_call_limit_marks_profile_not_checked_without_inventing_phone(self):
  self.configure();r=self.run_flow([self.decision(self.mesa,'mesa'),self.decision(result=self.result)],config={**self.config,'ai_steps':2})
  self.assertEqual(r['presidenteNome'],'João da Silva');self.assertIsNone(r['presidenteTelefone']);self.assertEqual(r['navigation']['status'],'partial');self.assertIn('ficha',r['navigation']['stop_reason'])
 def test_forbidden_source_not_promoted_even_with_mesa_label(self):
  self.configure();bad='https://camara.example.org/noticias/mesa-diretora-2026';self.pages[self.root]['page']['nav']=[{'url':bad,'label':'Mesa Diretora'}]
  r=self.run_flow([self.decision(bad,'mesa')]);self.assertEqual(len(self.calls),1);self.assertFalse(r['presidenciaAceita'])
 def test_ambiguous_or_unobserved_profile_not_chosen(self):
  self.configure();pack={'pages':[self.pages[self.mesa]['page']]};pres={'name':'João da Silva'}
  self.assertIsNone(nav.observed_profile(pack,pres,set(),set()))
  page=pack['pages'][0];page['nav'].append({'url':self.listing,'label':'João da Silva'})
  self.assertIsNone(nav.observed_profile(pack,pres,{self.profile,self.listing},set()))
 def test_compact_model_payload_keeps_page_text_and_full_local_evidence(self):
  pack={'pages':[{'text':'Texto integral','mainText':'Texto repetido','nav':[]}],'institutional':[{'kind':'email','value':'camara@example.org','url':self.root,'quote':('Privacidade '*3000)+' camara@example.org'}]*12,'primaryMesaUrls':[]}
  before=copy.deepcopy(pack);compact=nav.model_evidence(pack);self.assertEqual(pack,before);self.assertEqual(compact['pages'][0]['text'],'Texto integral');self.assertNotIn('mainText',compact['pages'][0]);self.assertEqual(len(compact['institutional']),1);self.assertIn('camara@example.org',compact['institutional'][0]['quote']);self.assertLess(len(json.dumps(compact)),len(json.dumps(pack))*.1)
 def test_observed_menu_does_not_make_explicit_old_mesa_current(self):
  self.configure();q='Mesa Diretora 2024 Presidente João da Silva';self.pages[self.mesa]['page'].update(text=q,mainText=q,compositionPeriods=['2024']);r=copy.deepcopy(self.result);r['president']['period']='2024';r['president']['evidence']['quote']=q
  out=self.run_flow([self.decision(self.mesa,'mesa'),self.decision(result=r)]);self.assertFalse(out['presidenciaAceita'])

 def test_short_main_does_not_hide_old_period_in_full_page_text(self):
  self.configure();self.pages[self.mesa]['page']['text']='Mesa Diretora 2024\n'+self.quote;out=self.run_flow([self.decision(self.mesa,'mesa'),self.decision(result=self.result)]);self.assertFalse(out['presidenciaAceita'])
