"""Servidor temporário de testes; sem sessão ou mensagem real de WhatsApp."""
import sys,tempfile,threading
from pathlib import Path
sys.path[:0]=[str(Path.cwd()),str(Path.cwd()/'tests')]
import app
from test_flow import workbook
from http.server import ThreadingHTTPServer
root=tempfile.TemporaryDirectory();store=app.Store(Path(root.name)/'dados');store.import_xlsx(workbook())
store.add_phone('SC-TIJUCAS',{'target':'camara','number':'48999990001','whatsapp_verified':False});store.add_phone('SC-TIJUCAS',{'target':'presidente','number':'48999990002','whatsapp_verified':False});store.save_item('SC-TIJUCAS',{'Presidente Atual (Nome)':'Márcia da Silva'},{})
app.STORE=store;server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);print('PORT='+str(server.server_port),flush=True);server.serve_forever()
