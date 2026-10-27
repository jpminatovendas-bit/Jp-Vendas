import sys,tempfile,threading,json
from pathlib import Path
sys.path[:0]=[str(Path.cwd()),str(Path.cwd()/'tests')]
import app
from test_flow import workbook
from http.server import ThreadingHTTPServer
root=tempfile.TemporaryDirectory();store=app.Store(Path(root.name)/'dados');store.import_xlsx(workbook())
for i in range(8):store.add_phone('SC-TIJUCAS',{'target':'camara','number':'4899999000'+str(i),'whatsapp_verified':i==0})
store.add_phone('SC-TIJUCAS',{'target':'presidente','number':'48999990099','whatsapp_verified':False});store.save_item('SC-TIJUCAS',{'Presidente Atual (Nome)':'Márcia da Silva','Email Geral da Câmara':'camara@example.org','Presidente - Email':'presidente@example.org'},{})
app.STORE=store;server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);print('PORT='+str(server.server_port),flush=True);server.serve_forever()
