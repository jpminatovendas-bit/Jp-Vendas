"""Protótipo de consulta sem mensagens, com Google obrigatório e conta exclusiva."""
import json,secrets,time,re,hashlib
from datetime import datetime
import google_contacts,whatsapp_verify

def initialize(store):
 with store.connect() as db:db.execute('CREATE TABLE IF NOT EXISTS whatsapp_browser_queue (number TEXT PRIMARY KEY,value TEXT NOT NULL)')
def rows(store):
 with store.connect() as db:return [json.loads(v) for v, in db.execute('SELECT value FROM whatsapp_browser_queue ORDER BY rowid')]
def persist(store,value):
 with store.connect() as db:db.execute('INSERT OR REPLACE INTO whatsapp_browser_queue VALUES (?,?)',(value['number'],json.dumps(value,ensure_ascii=False)))
def config(store):return store.setting('whatsapp_browser_config',{'paused':True,'expected_number':'','interval':10,'message':'Configure o número exclusivo de consulta.'})
def public(store):
 values=rows(store);c=config(store)
 return {'config':c,'items':values[-300:],'counts':{s:sum(r['state']==s for r in values) for s in ('waiting_google','pending','running','confirmed','absent','inconclusive','invalid','cancelled')},'connection':store.setting('whatsapp_browser_connection',{})}
def fresh(value):
 try:return value.get('provider')=='manual' or value.get('state') in ('confirmed','absent') and time.time()-datetime.fromisoformat(value['checked_at']).timestamp()<30*86400
 except (ValueError,KeyError,TypeError):return False
def invalid_entries(store,keys):
 import app
 result=[]
 for key in keys:
  item=store.item(key)
  for target,fields in [('camara',['Telefone Planilha Original','Telefones Coletados no Site','WhatsApp(s) da Câmara (Botões/Links)']),('presidente',['Presidente - Telefone / Celular','Presidente - WhatsApp'])]:
   for field in fields:
    for part in re.split(r'[;,|\n]',str(item['fields'].get(field,'') or '')):
     raw=part.strip()
     if not raw or not any(c.isdigit() for c in raw) or raw.startswith(('https://','http://','whatsapp://')) or app.phone_numbers(raw):continue
     identity='invalid:'+hashlib.sha256((key+target+field+raw).encode()).hexdigest()[:24]
     result.append({'number':identity,'display_number':raw[:100],'state':'invalid','refs':[{'key':key,'target':target,'municipality':item['fields']['Município'],'uf':item['fields']['UF']}],'message':'Formato inválido ou ambíguo em '+field+'. Corrija no cadastro; não foi consultado.'})
 return result
def configure(store,body):
 import app
 if whatsapp_verify.config(store)['enabled']:raise ValueError('Desative o gateway no painel Conferir WhatsApp antes de usar o verificador exclusivo.')
 number=app.normalize_phone(body.get('expected_number'));interval=int(body.get('interval',10))
 if not 10<=interval<=120:raise ValueError('Intervalo deve ser de 10 a 120 segundos. Comece com um lote pequeno.')
 with store.lock:
  if any(r['state']=='running' for r in rows(store)):raise ValueError('Espere a consulta atual terminar antes de trocar a configuração.')
  store.set_setting('whatsapp_browser_config',{'paused':True,'expected_number':number,'interval':interval,'message':'Configurado. Abra o validador no perfil exclusivo do Chrome.'})
  for token,binding in list(store.capture_sessions.items()):
   if binding.get('scope')=='whatsapp_verifier':store.capture_sessions.pop(token,None)
 return {'ok':True}
def enqueue(store,keys):
 if not isinstance(keys,list) or not keys:raise ValueError('Selecione municípios ou use os filtros atuais.')
 inventory=whatsapp_verify.phone_inventory(store,keys);added=0
 with store.lock:
  existing={r['number']:r for r in rows(store)}
  with store.connect() as db:cache={n:json.loads(v) for n,v in db.execute('SELECT number,value FROM whatsapp_checks')}
  for number,refs in inventory.items():
   current=existing.get(number)
   manual=any(r['manual_confirmed'] for r in refs)
   if current and (current['state']=='running' or fresh(current) and not manual):
    combined={(r['key'],r['target']):r for r in current.get('refs',[])};combined.update({(r['key'],r['target']):r for r in refs});current['refs']=list(combined.values());persist(store,current)
    if current['state'] in ('confirmed','absent'):whatsapp_verify.propagate(store,number,current,refs)
    continue
   old=cache.get(number,{})
   if manual or old.get('state')=='confirmed' and fresh(old):
    result={**old,'number':number,'state':'confirmed','provider':'manual' if manual else old.get('provider'),'checked_at':old.get('checked_at',whatsapp_verify.stamp()),'message':'Confirmação anterior preservada.','refs':refs};persist(store,result);whatsapp_verify.persist(store,result);whatsapp_verify.propagate(store,number,result,refs);continue
   # Uma ausência histórica precisa ser reavaliada manualmente pelo painel anterior.
   if old.get('state')=='absent' and fresh(old):
    value={**old,'refs':refs};persist(store,value);whatsapp_verify.propagate(store,number,value,refs);continue
   if current and current['state']=='inconclusive':continue
   if not current:added+=1
   ready=all(google_contacts.number_synced(store,r,number) for r in refs)
   persist(store,{'number':number,'refs':refs,'state':'pending' if ready else 'waiting_google','created_at':current.get('created_at') if current else whatsapp_verify.stamp(),'message':'Aguardando gravação confirmada no Google.' if not ready else 'Aguardando validador conectado.'})
  for invalid in invalid_entries(store,keys):persist(store,invalid)
 return {'ok':True,'added':added,**public(store)}
def start(store):
 c=config(store)
 if whatsapp_verify.config(store)['enabled']:raise ValueError('Desative o gateway no painel Conferir WhatsApp antes de usar o verificador exclusivo.')
 if not c['expected_number']:raise ValueError('Configure o número exclusivo antes de abrir o validador.')
 items=store.items()
 if not items:raise ValueError('Importe os municípios primeiro.')
 result=store.start_capture(items[0]['key'],'https://web.whatsapp.com/')
 with store.lock:
  store.capture_tickets[result['ticket']].update(scope='whatsapp_verifier',expected_number=c['expected_number'])
 return result
def binding(store,token,body):
 import app
 b=store.capture_binding(token)
 if b.get('scope')!='whatsapp_verifier':raise ValueError('Sessão de verificação inválida.')
 before=app.normalize_phone(body.get('account'))
 if before!=b.get('expected_number') or before!=config(store).get('expected_number'):
  pause(store,'Conta diferente do número exclusivo. Nenhuma consulta autorizada.');raise ValueError('O WhatsApp conectado não é o número exclusivo configurado.')
 return b
def pause(store,message):
 c=config(store);c.update(paused=True,message=message);store.set_setting('whatsapp_browser_config',c)
def control(store,body):
 action=body.get('action')
 with store.lock:
  c=config(store)
  if action=='resume':
   if not c['expected_number']:raise ValueError('Configure o número exclusivo.')
   c.update(paused=False,message='Aguardando extensão e WhatsApp conectado.')
  elif action=='pause':c.update(paused=True,message='Fila pausada pelo usuário.')
  elif action=='cancel':
   c.update(paused=True,message='Pendentes cancelados. Uma consulta em andamento pode concluir.')
   for r in rows(store):
    if r['state'] in ('pending','waiting_google','inconclusive'):r.update(state='cancelled',lease=None);persist(store,r)
  elif action=='retry':
   r=next((r for r in rows(store) if r['number']==body.get('number')),None)
   if not r or r['state'] not in ('inconclusive','cancelled'):raise ValueError('Escolha um resultado inconclusivo ou cancelado.')
   r.update(state='waiting_google',lease=None,message='Nova tentativa solicitada manualmente.');persist(store,r)
  else:raise ValueError('Ação inválida.')
  store.set_setting('whatsapp_browser_config',c)
 return public(store)
def next_task(store,token,body):
 with store.lock:
  b=binding(store,token,body);c=config(store)
  if whatsapp_verify.config(store)['enabled']:
   pause(store,'Gateway ativado. Use somente um método de consulta por vez.');return {'task':None,'message':'Desative o gateway antes de continuar este protótipo.'}
  store.set_setting('whatsapp_browser_connection',{'number':body['account'],'checked_at':whatsapp_verify.stamp(),'connected':True})
  values=rows(store)
  for r in values:
   if r['state']=='running' and r.get('lease_until',0)<time.time():
    r.update(state='inconclusive',message='Validador desconectado durante a consulta. Sem confirmação de resultado.',lease=None);persist(store,r);pause(store,r['message']);return {'task':None,'message':r['message']}
  if c['paused']:return {'task':None,'message':c['message']}
  if any(r['state']=='running' for r in values) or time.time()<store.setting('whatsapp_browser_next',0):return {'task':None,'message':'Aguardando consulta anterior ou intervalo.'}
  current=whatsapp_verify.phone_inventory(store)
  for r in values:
   if r['state'] not in ('waiting_google','pending'):continue
   refs=[ref for ref in current.get(r['number'],[]) if any(old['key']==ref['key'] and old['target']==ref['target'] for old in r['refs'])]
   if not refs:r.update(state='cancelled',message='Número removido ou alterado no cadastro.');persist(store,r);continue
   r['refs']=refs
   if not all(google_contacts.number_synced(store,ref,r['number']) for ref in refs):
    r.update(state='waiting_google',message='Sincronize os contatos no Google antes da consulta.');persist(store,r);continue
   lease=secrets.token_hex(24);r.update(state='running',lease=lease,lease_until=time.time()+180,session=token,account=c['expected_number']);persist(store,r)
   store.set_setting('whatsapp_browser_next',time.time()+c['interval'])
   return {'task':{'number':r['number'],'lease':lease},'expected_number':c['expected_number']}
  return {'task':None,'message':'Sem números elegíveis. Confira os contatos pendentes no Google.'}
def result(store,token,body):
 with store.lock:
  binding(store,token,body)
  r=next((r for r in rows(store) if r['number']==body.get('number')),None)
  if not r or r.get('session')!=token or r.get('lease')!=body.get('lease') or r['state']!='running' or r.get('lease_until',0)<time.time():raise ValueError('Consulta expirada ou já registrada.')
  if body.get('account_after')!=body.get('account') or body.get('account_after')!=r['account']:pause(store,'Conta alterada durante a consulta.');raise ValueError('Conta alterada. Resultado não aplicado.')
  state=body.get('state')
  if state not in ('confirmed','absent','inconclusive'):raise ValueError('Resultado inválido.')
  if state=='absent' and body.get('evidence')!='explicit_null':state='inconclusive'
  if state=='confirmed' and body.get('evidence')!='matching_wid':state='inconclusive'
  r.update(state=state,provider='wa-js-4.6.1-prototype',checked_at=whatsapp_verify.stamp(),lease=None,message={'confirmed':'Conta encontrada na consulta.','absent':'Consulta retornou explicitamente que não encontrou a conta.','inconclusive':'Consulta inconclusiva. Fila pausada; revise antes de tentar novamente.'}[state]);persist(store,r)
  if state=='inconclusive':pause(store,r['message'])
  else:
   whatsapp_verify.persist(store,r);whatsapp_verify.propagate(store,r['number'],r,r['refs'])
 return {'ok':True}
