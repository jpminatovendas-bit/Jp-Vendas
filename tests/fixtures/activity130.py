"""Histórico fictício por canal/dia para testar filtros, sem enviar mensagens."""
import sys,tempfile,threading,io
from pathlib import Path
sys.path[:0]=[str(Path.cwd()),str(Path.cwd()/'tests')]
import app,openpyxl
from http.server import ThreadingHTTPServer
root=tempfile.TemporaryDirectory();store=app.Store(Path(root.name)/'dados')
wb=openpyxl.Workbook();wb.active.append(['Código Único','Município','UF','Telefone Planilha Original','Website Câmara'])
for city in ['Alegrete','Aratiba','Barra do Rio Azul','Caiçara','Erechim','Faxinalzinho','Gaurama']:wb.active.append(['RS-'+app.norm(city),city,'RS','(51) 99999-0001','https://camara.example.org'])
b=io.BytesIO();wb.save(b);store.import_xlsx(b.getvalue());counter=0

def event(city,channel,date,confirmed=True,kind='sent'):
 global counter
 key='RS-'+app.norm(city);counter+=1
 if channel=='whatsapp' and confirmed:store.add_phone(key,{'number':'51999990001','target':'camara','whatsapp_verified':True})
 store.record_interaction(key,{'id':f'{counter:024x}','kind':kind,'channel':channel,'target':'camara','recipient':'5551999990001' if channel=='whatsapp' else 'test@example.org'})
 with store.connect() as db:db.execute('UPDATE interactions SET timestamp=? WHERE id=?',(date,f'{counter:024x}'))
event('Alegrete','whatsapp','2026-10-23T09:00:00-03:00');event('Aratiba','email','2026-10-23T10:00:00-03:00');event('Barra do Rio Azul','whatsapp','2026-10-23T10:00:00-03:00');event('Barra do Rio Azul','email','2026-10-23T11:00:00-03:00');event('Caiçara','whatsapp','2026-09-30T12:00:00-03:00');event('Caiçara','email','2026-10-23T12:00:00-03:00');event('Faxinalzinho','email','2026-10-18T14:00:00-03:00');event('Gaurama','whatsapp','2026-10-23T10:00:00-03:00',False);event('Gaurama','email','2026-10-23T10:00:00-03:00',kind='contact')
store.save_route({'center':{'lat':-27.4,'lon':-52.3,'label':'Aratiba'},'radius':50,'keys':['RS-ARATIBA','RS-CAICARA']})
app.STORE=store;server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);print('PORT='+str(server.server_port),flush=True);server.serve_forever()
