"""Dados temporários para gerar PDF pelo navegador, sem API externa."""
import sys,tempfile,threading
from pathlib import Path
sys.path[:0]=[str(Path.cwd()),str(Path.cwd()/'tests')]
import app,fitz
from PIL import Image
from test_flow import workbook,image
from http.server import ThreadingHTTPServer
root=tempfile.TemporaryDirectory();folder=Path(root.name);store=app.Store(folder/'dados');store.import_xlsx(workbook())
original=folder/'original.png';image(original);restored=folder/'restored.png';Image.effect_noise((1024,1280),30).convert('RGB').save(restored)
pairs=[];restored_files=[]
for i in range(9):
 ready=folder/('restored-'+str(i)+'.png');ready.write_bytes(restored.read_bytes());restored_files.append({'path':str(ready),'relative':ready.name})
 pairs.append({'id':'person-'+str(i),'name':'Pessoa '+str(i),'relative':original.name,'original':str(original),'restored':str(ready),'selected':True})
store.save_project('SC-TIJUCAS',{'pairs':pairs,'restored_files':restored_files,'crest':str(original),'dirty':True})
standard=folder/'standard.pdf'
with fitz.open() as doc:
 p=doc.new_page(width=1683.75,height=2384.25);p.insert_text((100,200),'CATALOGO FIXO',fontsize=40);doc.save(standard)
store.set_setting('catalogue',{'path':str(standard)})
app.STORE=store;server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);print('PORT='+str(server.server_port),flush=True);server.serve_forever()
