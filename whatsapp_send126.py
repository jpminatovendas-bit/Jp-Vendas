"""Tentativas de envio e conferência manual de existência de WhatsApp."""
import json,re
from datetime import datetime

def initialize(db):
 db.execute('CREATE TABLE IF NOT EXISTS whatsapp_send_checks (id TEXT PRIMARY KEY, state TEXT NOT NULL)')

def confirmed(local,target,recipient):
 from communication import normalize_recipient
 try:number=normalize_recipient('whatsapp',recipient)
 except ValueError:return False
 return bool(re.fullmatch(r'55\d{10,11}',number) and local.get('phone_status',{}).get(target,{}).get(number,{}).get('whatsapp_verified') is True)

def states(db):return dict(db.execute('SELECT id,state FROM whatsapp_send_checks'))

def allowed(local,target,recipient,state=None):
 return state not in ('pending','rejected','opaque') and confirmed(local,target,recipient)

def revoke(store,key,target,number):
 """Desativa de forma permanente envios antigos quando a confirmação é retirada."""
 with store.lock:
  with store.connect() as db:
   ids=[x[0] for x in db.execute("SELECT id FROM interactions WHERE municipality_key=? AND target=? AND recipient=? AND channel='whatsapp' AND kind='sent'",(key,target,number))]
   for ident in ids:db.execute("INSERT OR REPLACE INTO whatsapp_send_checks VALUES (?,'rejected')",(ident,))
  for ident in ids:store.correct_interaction(key,{'id':ident,'active':False})

def verify(store,key,body):
 ident=body.get('id');answer=body.get('answer')
 if answer not in ('yes','no','later'):raise ValueError('Escolha Sim, Não ou Conferir depois.')
 with store.lock:
  with store.connect() as db:
   row=db.execute("SELECT target,recipient FROM interactions WHERE id=? AND municipality_key=? AND kind='sent' AND channel='whatsapp'",(ident,key)).fetchone()
   if not row:raise ValueError('Tentativa de WhatsApp não encontrada para este município.')
   target,number=row
   if not re.fullmatch(r'55\d{10,11}',number):raise ValueError('O link não informa um número. Cadastre o telefone antes de confirmar.')
   state=states(db).get(ident)
   if answer=='later':return {'ok':True,'verification_state':state or 'pending'}
   if state=='confirmed' and answer=='yes':return {'ok':True,'verification_state':'confirmed'}
   local=json.loads(db.execute('SELECT local FROM municipalities WHERE key=?',(key,)).fetchone()[0])
   status=local.setdefault('phone_status',{}).setdefault(target,{}).setdefault(number,{})
   stamp=datetime.now().astimezone().isoformat(timespec='seconds')
   status.update(whatsapp_verified=answer=='yes',verification_state='confirmed' if answer=='yes' else 'absent',verification_method='manual',checked_at=stamp)
   import editing_activity
   editing_activity.mark(local);db.execute('UPDATE municipalities SET local=? WHERE key=?',(json.dumps(local,ensure_ascii=False),key))
   # Somente esta tentativa pendente é consolidada; rejeitadas não ressuscitam.
   correction=db.execute('SELECT active FROM interaction_corrections WHERE id=?',(ident,)).fetchone()
   activate=answer=='yes' and state not in ('rejected','opaque') and not (correction and not correction[0])
   if activate:db.execute("INSERT OR REPLACE INTO whatsapp_send_checks VALUES (?,'confirmed')",(ident,))
  if answer=='no':revoke(store,key,target,number)
  elif activate:store.correct_interaction(key,{'id':ident,'active':True})
  return {'ok':True,'verification_state':'confirmed' if activate else 'rejected','item':store.item(key)}
