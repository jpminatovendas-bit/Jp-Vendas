"""Operador por sessão e autoria independente da responsabilidade comercial."""
import contextvars,json,secrets
from datetime import datetime
NAMES=('Jeff','Lara','Pai')
CURRENT=contextvars.ContextVar('jp_operator',default=None)
def actor():return CURRENT.get()
def stamp():return datetime.now().astimezone().isoformat(timespec='seconds')
def initialize(store):
 with store.connect() as db:db.execute('CREATE TABLE IF NOT EXISTS operator_audit (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, operator TEXT, action TEXT NOT NULL, municipality_key TEXT, detail TEXT NOT NULL)');db.execute('CREATE INDEX IF NOT EXISTS audit_city131 ON operator_audit(municipality_key,timestamp)')
def audit(store,action,key=None,detail=None,operator=None):
 who=operator if operator is not None else actor()
 if who not in NAMES:return
 with store.lock,store.connect() as db:db.execute('INSERT INTO operator_audit VALUES (?,?,?,?,?,?)',(secrets.token_hex(12),stamp(),who,action,key,json.dumps(detail or {},ensure_ascii=False)))
def history(store,key=None):
 with store.connect() as db:
  rows=db.execute('SELECT timestamp,operator,action,municipality_key,detail FROM operator_audit '+('WHERE municipality_key=? ' if key else '')+'ORDER BY rowid DESC LIMIT 100',(key,) if key else ()).fetchall()
 return [dict(timestamp=t,operator=o,action=a,key=k,detail=json.loads(d)) for t,o,a,k,d in rows]
def assign(store,body):
 owner=body.get('owner') or None
 if owner is not None and owner not in NAMES:raise ValueError('Escolha Jeff, Lara, Pai ou Sem responsável.')
 with store.lock,store.connect() as db:
  db.execute('BEGIN IMMEDIATE');row=db.execute('SELECT value FROM commercial_routes WHERE id=?',(body.get('id'),)).fetchone()
  if not row:raise ValueError('Rota não encontrada.')
  r=json.loads(row[0])
  if r.get('revision',1)!=body.get('revision'):raise ValueError('Rota alterada por outro operador. Atualize antes de atribuir.')
  before=r.get('owner');r.update(owner=owner,revision=r.get('revision',1)+1,updated_at=stamp())
  db.execute('UPDATE commercial_routes SET value=? WHERE id=?',(json.dumps(r,ensure_ascii=False),body['id']))
 audit(store,'Responsável da rota',detail={'route':body['id'],'previous':before,'owner':owner})
 return {'route':dict(r,id=body['id'])}
