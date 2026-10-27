import tempfile,unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app,catalogue125,fitz,data_storage
from test_flow import image,workbook

class Catalogue125(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.store=app.Store(self.root/'dados');self.store.import_xlsx(workbook());self.photo=self.root/'photo.png';image(self.photo)
 def tearDown(self):self.store.contact_engine.close();self.tmp.cleanup()
 def test_new_base_used_with_legacy_data_and_originals_not_changed(self):
  legacy=data_storage.template(self.store,'capa.pdf');original=legacy.read_bytes()
  pairs=[{'name':'MÁRCIA TESTE '+str(i),'original':str(self.photo),'restored':str(self.photo)} for i in range(10)]
  item={'fields':{'Município':'São José do Inhacorá','UF':'RS'}}
  doc=catalogue125.build(self.store,item,{'crest':str(self.photo),'period':'2005–2008'},pairs)
  path=self.root/'new.pdf';doc.save(path);doc.close()
  with fitz.open(path) as saved:
   self.assertEqual(len(saved),3)
   self.assertIn('SÃO JOSÉ DO INHACORÁ - RS',saved[0].get_text())
   for page in saved:self.assertAlmostEqual(page.rect.width,595.276,places=2)
   content=''.join(p.get_text() for p in saved)
   for wrong in ['FAXINALZINHO','AMÉRICO','IPUMIRIM','NOME DO MUNICÍPIO','1989']:self.assertNotIn(wrong,content.upper())
   for i in range(10):self.assertIn('MÁRCIA TESTE '+str(i),content)
   self.assertIn('2005–2008',content);self.assertIn('São José do Inhacorá - RS',content)
   self.assertIn('PADRONIZAÇÃO',content)
  self.assertEqual(legacy.read_bytes(),original)
  for name in ['personalizadas-1.25.pdf','DejaVuSans.ttf','DejaVuSans-Bold.ttf']:self.assertTrue(data_storage.template(self.store,name).is_file())
 def test_draft_missing_restored_and_long_name(self):
  item={'fields':{'Município':'São Francisco de Assis do Piauí','UF':'PI'}}
  with catalogue125.build(self.store,item,{},[{'name':'Nome completo muito extenso de pessoa para conferir ajuste','original':str(self.photo)}],True) as doc:
   text=''.join(p.get_text() for p in doc);self.assertIn('AGUARDANDO',text);self.assertIn('BRASÃO',text);self.assertIn('PRÉVIA',text)
 def test_clean_base_has_no_sample_pixels_in_portrait_slots(self):
  with fitz.open(data_storage.template(self.store,'personalizadas-1.25.pdf')) as doc:
   for x,y in [(25,375),(571,894),(1118,1415)]:
    pix=doc[1].get_pixmap(clip=catalogue125.rect(doc[1],(x+20,y+90,x+250,y+370)))
    colors=set(tuple(pix.samples[i:i+3]) for i in range(0,len(pix.samples),3));self.assertLessEqual(len(colors),2)
