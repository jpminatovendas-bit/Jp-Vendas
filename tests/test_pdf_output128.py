import hashlib, io, math, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import fitz
from PIL import Image
import app, catalogue125, pdf_output128 as output
from test_flow import workbook, image

class PDFOutput128(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
  self.store=app.Store(self.root/'dados');self.store.import_xlsx(workbook());self.key='SC-TIJUCAS'
 def tearDown(self):
  self.store.contact_engine.close();self.tmp.cleanup()
 def test_photo_copy_bounded_jpeg_white_alpha_exif_and_original_untouched(self):
  source=self.root/'portrait.png';Image.new('RGBA',(1024,1280),(180,50,10,128)).save(source)
  digest=hashlib.sha256(source.read_bytes()).hexdigest();box=fitz.Rect(0,0,86,107)
  data=output.image_stream(source,box,True)
  with Image.open(io.BytesIO(data)) as result:
   self.assertEqual(result.format,'JPEG');self.assertEqual(result.mode,'RGB')
   self.assertLessEqual(result.width,math.ceil(box.width*220/72));self.assertLessEqual(result.height,math.ceil(box.height*220/72))
   self.assertLess(abs(result.width/result.height-.8),.01)
   self.assertTrue(all(abs(a-b)<4 for a,b in zip(result.getpixel((0,0)),(217,152,132))))
  self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),digest)
  tiny=self.root/'tiny.jpg';exif=Image.Exif();exif[274]=6;Image.new('RGB',(20,30),'red').save(tiny,exif=exif)
  with Image.open(io.BytesIO(output.image_stream(tiny,box,True))) as result:self.assertEqual(result.size,(30,20))
 def test_crest_remains_lossless_with_transparency(self):
  source=self.root/'crest.png';Image.new('RGBA',(2000,1000),(0,10,200,0)).save(source)
  data=output.image_stream(source,fitz.Rect(0,0,72,72))
  with Image.open(io.BytesIO(data)) as result:
   self.assertEqual(result.format,'PNG');self.assertEqual(result.size,(300,150));self.assertEqual(result.getpixel((0,0))[3],0)
 def test_nine_high_resolution_portraits_compact_without_changing_sources(self):
  photo=self.root/'restored.png';Image.effect_noise((1024,1280),30).convert('RGB').save(photo)
  original=self.root/'original.jpg';image(original)
  digest=hashlib.sha256(photo.read_bytes()).hexdigest()
  pairs=[{'name':'VEREADOR '+str(i),'original':str(original),'restored':str(photo)} for i in range(9)]
  with catalogue125.build(self.store,{'fields':{'Município':'Tijucas','UF':'SC'}},{'crest':str(original)},pairs) as doc:
   images=doc[1].get_images(full=True)
   portraits=[im for im in images if im[8]=='DCTDecode']
   self.assertGreaterEqual(len(portraits),9)
   for im in portraits:self.assertLessEqual(im[2],263);self.assertLessEqual(im[3],327)
   self.assertLess(len(doc.tobytes(garbage=4,deflate=True)),1_500_000)
   self.assertIn('VEREADOR 8',doc[1].get_text())
  self.assertEqual(hashlib.sha256(photo.read_bytes()).hexdigest(),digest)
 def test_a4_mixed_sizes_rotation_crop_blank_text_links_and_bookmarks(self):
  source=fitz.open()
  for rotation in (0,90,180,270):
   p=source.new_page(width=800,height=1300);p.set_cropbox(fitz.Rect(50,60,650,1060))
   p.draw_rect((60,80,200,180),fill=(1,0,0));p.insert_text((70,240),'ROTA '+str(rotation))
   p.insert_link({'kind':fitz.LINK_URI,'from':fitz.Rect(60,80,200,180),'uri':'https://jpminato.example/catalogo'})
   p.set_rotation(rotation)
  source.new_page(width=1683.75,height=2384.25)
  source[0].insert_link({'kind':fitz.LINK_GOTO,'from':fitz.Rect(220,80,260,130),'page':3,'to':fitz.Point(30,50)})
  source.set_toc([[1,'Catalogo',1],[1,'Fim',5]])
  source=fitz.open(stream=source.tobytes(),filetype='pdf')
  with output.normalize_a4(source) as result:
   result=fitz.open(stream=result.tobytes(garbage=4,deflate=True),filetype='pdf')
   self.assertEqual(len(result),5);self.assertEqual(result.get_toc(),source.get_toc())
   for i,p in enumerate(result):
    self.assertAlmostEqual(p.rect.width,output.A4.width,places=3);self.assertAlmostEqual(p.rect.height,output.A4.height,places=3)
    if i<4:
     self.assertIn('ROTA',p.get_text());link=next(x for x in p.get_links() if x['kind']==fitz.LINK_URI)
     pix=p.get_pixmap(clip=link['from']);self.assertEqual(pix.pixel(pix.width//2,pix.height//2),(255,0,0))
   goto=next(x for x in result[0].get_links() if x['kind']==fitz.LINK_GOTO);self.assertEqual(goto['page'],3)
   original_goto=next(x for x in source[0].get_links() if x['kind']==fitz.LINK_GOTO)
   expected=original_goto['to']*output.fit_matrix(source[3])
   self.assertLess(abs(goto['to'].x-expected.x),.01);self.assertLess(abs(goto['to'].y-expected.y),.01)
   result.close()
  self.assertEqual([p.rotation for p in source],[0,90,180,270,0]);source.close()
 def test_full_store_draft_final_large_standard_unchanged_and_pdfs_preserved(self):
  photo=self.root/'photo.png';image(photo)
  self.store.save_project(self.key,{'pairs':[{'name':'PESSOA','original':str(photo),'restored':str(photo),'selected':True}],'crest':str(photo),'dirty':True})
  standard=self.root/'standard.pdf'
  with fitz.open() as doc:
   p=doc.new_page(width=1683.75,height=2384.25);p.insert_text((200,200),'PAGINA PADRAO',fontsize=32)
   p.insert_link({'kind':fitz.LINK_URI,'from':fitz.Rect(200,200,500,260),'uri':'https://example.com'})
   doc.save(standard)
  before=standard.read_bytes();self.store.set_setting('catalogue',{'path':str(standard)})
  old=self.root/'old.pdf';old.write_bytes(b'PDF anterior preservado')
  project=self.store.project(self.key);project['pdf']=str(old);self.store.save_project(self.key,project)
  for draft in (True,False):
   response=self.store.pdf(self.key,draft)
   with fitz.open(self.store.files[response['url'].split('/')[-1]]) as doc:
    self.assertEqual(len(doc),3)
    for p in doc:self.assertAlmostEqual(p.rect.width,output.A4.width,places=3);self.assertAlmostEqual(p.rect.height,output.A4.height,places=3)
    self.assertIn('PAGINA PADRAO',doc[2].get_text());self.assertTrue(doc[2].get_links())
  self.assertEqual(standard.read_bytes(),before);self.assertEqual(old.read_bytes(),b'PDF anterior preservado')
  self.assertEqual(self.store.project(self.key)['layout_version'],'1.28')

if __name__=='__main__':unittest.main()
