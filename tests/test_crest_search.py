import unittest,sys,tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import crest_capture as cc
from app import Store
from test_flow import workbook
class CrestSearch(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.store=Store(Path(self.temp.name)/'dados');self.store.import_xlsx(workbook(city='Aratiba'));self.key='SC-TIJUCAS'
  # Fixture uses RS consistently with the reported municipality.
  self.store.save_item(self.key,{'UF':'RS'},{});self.city='Aratiba'
 def tearDown(self):self.store.contact_engine.close();self.temp.cleanup()
 def page(self,title='Aratiba',text='Aratiba é um município brasileiro do estado do Rio Grande do Sul.',**extra):return {'query':{'pages':{'1':{'title':title,'extract':text,**extra}}}}
 def test_open_google_query_has_no_wikipedia_restriction_or_automatic_choice(self):
  with patch.object(cc,'google_html') as google,patch.object(cc,'query') as wiki:
   r=cc.start(self.store,self.key);self.assertFalse(r['verified']);self.assertEqual(r['search_query'],'brasão Aratiba RS');self.assertIn('google.com/search',self.store.capture_tickets[r['ticket']]['url']);google.assert_not_called();wiki.assert_not_called()
 def test_wrong_state_redirect_or_disambiguation_open_manual(self):
  html='<a href="https://pt.wikipedia.org/wiki/Aratiba">Aratiba</a>'
  for page in [self.page(text='Aratiba é um município brasileiro do estado de Santa Catarina.'),self.page(title='Taquara'),self.page(pageprops={'disambiguation':''}),self.page(text='Aratiba é um município na divisa de Rio Grande do Sul e Santa Catarina.')]:
   with self.subTest(page=page),patch.object(cc,'google_html',return_value=html),patch.object(cc,'query',return_value=page):
    r=cc.start(self.store,self.key);self.assertFalse(r['verified']);self.assertTrue(self.store.capture_tickets[r['ticket']]['url'].startswith('https://www.google.com/search?'))
 def test_google_parser_only_exact_wikipedia_domains_and_order(self):
  html='<a href="https://pt.wikipedia.org.evil.example/wiki/Aratiba">Fake</a><a href="https://pt.wikipedia.org/wiki/Taquara">Other</a><a href="https://pt.wikipedia.org/wiki/Aratiba#Brasao">Right</a><a href="https://pt.wikipedia.org/wiki/Aratiba?utm=x">Duplicate</a>'
  self.assertEqual(cc.google_candidates(html),['https://pt.wikipedia.org/wiki/Taquara','https://pt.wikipedia.org/wiki/Aratiba']);self.assertFalse(cc.title_matches('Ficheiro:Brasão de Aratiba.svg','Aratiba','RS'));self.assertFalse(cc.title_matches('Aratiba (Santa Catarina)','Aratiba','RS'));self.assertTrue(cc.title_matches('Aratiba (Rio Grande do Sul)','ARATIBA','RS'))
 def test_google_block_keeps_binding_and_never_guesses_wiki_page(self):
  with patch.object(cc,'google_html',return_value='<p>Captcha</p>'),patch.object(cc,'query') as wiki:
   r=cc.start(self.store,self.key);wiki.assert_not_called();binding=self.store.connect_capture(r['ticket'],1);self.assertEqual(binding['scope'],'crest');self.assertEqual(binding['key'],self.key);self.assertIn('google.com/search',binding['url'])
