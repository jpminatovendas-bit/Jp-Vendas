import unittest,sys,tempfile,json
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import fitz,app,crest_capture as cc,capture_routes
from test_flow import workbook

class RasterCrest(unittest.TestCase):
 def raster(self,alpha=False):
  p=fitz.Pixmap(fitz.csRGB,fitz.IRect(0,0,160,200),alpha);p.clear_with()
  p.set_rect(fitz.IRect(20,20,140,180),(100,120,140,255) if alpha else (100,120,140));return p
 def test_png_and_jpeg_convert_without_broken_image_profile(self):
  for ext in ('png','jpeg'):
   with self.subTest(ext=ext),patch.object(fitz,'image_profile',side_effect=TypeError("in method 'fz_recognize_image_format', argument 1 of type 'unsigned char [8]'")) as broken:
    result=fitz.Pixmap(cc.as_png(self.raster().tobytes(ext)));self.assertEqual((result.width,result.height),(160,200));self.assertLessEqual(max(abs(a-b) for a,b in zip(result.pixel(50,50)[:3],(100,120,140))),4);broken.assert_not_called()
 def test_png_preserves_transparency_and_dimensions(self):
  result=fitz.Pixmap(cc.as_png(self.raster(True).tobytes('png')));self.assertTrue(result.alpha);self.assertEqual((result.width,result.height),(160,200));self.assertEqual(result.pixel(0,0)[3],0);self.assertEqual(result.pixel(50,50),(100,120,140,255))
 def test_webp_preserves_transparency_colors_and_dimensions(self):
  import base64
  raw=base64.b64decode('UklGRjAAAABXRUJQVlA4TCQAAAAvn8AxEA8weEM2jPMf8CATsNBA/5YaON27RPR/AgRkOvpvoBE=')
  result=fitz.Pixmap(cc.as_png(raw));self.assertEqual((result.width,result.height),(160,200));self.assertTrue(result.alpha);self.assertEqual(result.pixel(0,0)[3],0);self.assertEqual(result.pixel(50,50),(100,120,140,255))
 def test_document_and_html_are_not_accepted_as_raster(self):
  doc=fitz.open();doc.new_page();pdf=doc.tobytes();doc.close()
  for raw in (pdf,b'<html>Access denied</html>',b'',b'not an image'):
   with self.subTest(raw=raw[:20]),self.assertRaisesRegex(ValueError,'PNG, JPG ou WebP'):cc.as_png(raw)
 def test_oversized_image_rejected_before_decoding(self):
  raw=self.raster().tobytes('png')
  with patch.object(fitz.Page,'get_image_info',return_value=[{'width':5000,'height':5000}]),patch.object(fitz,'Pixmap') as decoder:
   with self.assertRaises(ValueError):cc.as_png(raw)
   decoder.assert_not_called()
 def test_capture_saves_raster_updates_preview_and_keeps_previous_crest(self):
  with tempfile.TemporaryDirectory() as folder:
   store=app.Store(Path(folder)/'dados');store.import_xlsx(workbook());key='SC-TIJUCAS'
   try:
    original=self.raster().tobytes('png');store.crest(key,original,'old.png');old=store.project(key)['crest'];ticket=cc.start(store,key)['ticket'];b=store.connect_capture(ticket,1)
    source='https://prefeitura.example.org/simbolos';capture_routes.advance(store,b['token'],{'tab_id':1,'from_url':b['url'],'url':source,'transition':'link'})
    with patch.object(cc.public_images,'fetch',return_value=self.raster(True).tobytes('png')):
     result=cc.capture(store,b['token'],{'tab_id':1,'url':source,'src_url':'https://cdn.example.org/brasao.png'})
    p=store.project(key);self.assertTrue(result['ok']);self.assertIn(old,p['crest_versions']);self.assertTrue(Path(old).exists());self.assertTrue(p['dirty']);self.assertTrue(fitz.Pixmap(p['crest']).alpha);self.assertEqual(store.capture_updates[-1]['field'],'Brasão');self.assertFalse(store.interaction_history(key))
   finally:store.contact_engine.close()
 def test_launcher_installs_requirements_when_image_codec_is_missing(self):
  import launcher
  from types import SimpleNamespace
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);python=root/'.venv'/('Scripts/python.exe' if launcher.os.name=='nt' else 'bin/python');python.parent.mkdir(parents=True);python.touch()
   with patch.object(launcher,'ROOT',root),patch.object(launcher,'DATA',root/'dados'),patch.object(launcher.subprocess,'run',side_effect=[SimpleNamespace(returncode=1),SimpleNamespace(returncode=0)]) as run:
    launcher.prepare();self.assertIn('PIL',run.call_args_list[0].args[0][-1]);self.assertEqual(run.call_args_list[1].args[0][1:5],['-m','pip','install','-r']);self.assertEqual(run.call_args_list[1].args[0][-1],str(root/'requirements.txt'))
