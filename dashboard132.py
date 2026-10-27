"""Painel comercial compartilhado; atribuição organiza, nunca restringe acesso."""
import json,re,secrets
from datetime import datetime,timedelta,time,date
import operators131,send_activity130,whatsapp_send126,inbox131
TZ=send_activity130.BRAZIL
STAGES={'a_contactar':'A contactar','contactada':'Contactada · definir próximo passo','aguardando':'Aguardando resposta','conversa':'Em conversa','encaminhado':'Encaminhado ao vendedor','negociacao':'Em negociação','ganho':'Ganho','perdido':'Perdido'}
OUTCOMES={'nao_atendeu','retornar','numero_incorreto','atendeu','whatsapp_informado','sem_whatsapp'}
def now():return datetime.now(TZ)
def initialize(store):
 with store.connect() as db:
  db.executescript('CREATE TABLE IF NOT EXISTS desk_tasks132 (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS desk_cases132 (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS desk_events132 (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, operator TEXT NOT NULL, key TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL); CREATE INDEX IF NOT EXISTS desk_events_date132 ON desk_events132(timestamp);')
def parse_time(value):
 try:
  v=datetime.fromisoformat(str(value).replace('Z','+00:00'));return v.replace(tzinfo=TZ) if v.tzinfo is None else v.astimezone(TZ)
 except (TypeError,ValueError):raise ValueError('Data ou horário inválido.') from None
def period(query,today):
 name=query.get('period',['week'])[0]
 if name=='custom':
  try:start=date.fromisoformat(query.get('start',[''])[0]);end=date.fromisoformat(query.get('end',[''])[0])
  except ValueError:raise ValueError('Informe as datas inicial e final.') from None
 elif name=='today':start=end=today
 elif name=='week':start=today-timedelta(days=today.weekday());end=today
 elif name in ('7','30'):start=today-timedelta(days=int(name)-1);end=today
 else:raise ValueError('Período inválido.')
 if end<start or (end-start).days>366:raise ValueError('Escolha um período de até 367 dias, em ordem crescente.')
 return start,end
def operator():
 who=operators131.actor()
 if who not in operators131.NAMES:raise ValueError('Selecione um operador para registrar a ação.')
 return who
def text(body,key,limit=1000):
 value=str(body.get(key) or '').strip()
 if len(value)>limit:raise ValueError('Texto muito longo: '+key)
 return value
def owner(value):
 if value not in (*operators131.NAMES,'',None):raise ValueError('Responsável inválido.')
 return value or None
def save_task(store,b):
 who=operator();ident=b.get('id') or secrets.token_hex(12)
 if not re.fullmatch('[a-f0-9]{24}',ident):raise ValueError('Tarefa inválida.')
 with store.lock,store.connect() as db:
  previous=db.execute('SELECT value FROM desk_tasks132 WHERE id=?',(ident,)).fetchone();old=json.loads(previous[0]) if previous else {}
  if old and b.get('revision')!=old['revision']:raise ValueError('Tarefa alterada por outra pessoa. Atualize o painel.')
  key=b.get('key') or None
  if key and not db.execute('SELECT 1 FROM municipalities WHERE key=?',(key,)).fetchone():raise ValueError('Município não encontrado.')
  title=text(b,'title',200);due=text(b,'due',40)
  if not title:raise ValueError('Informe a tarefa.')
  if due:due=parse_time(due).isoformat(timespec='seconds')
  state=b.get('state','pending')
  if state not in ('pending','done','cancelled'):raise ValueError('Situação inválida.')
  task=dict(id=ident,key=key,title=title,notes=text(b,'notes',4000),owner=owner(b.get('owner')),due=due,state=state,created_by=old.get('created_by',who),created_at=old.get('created_at',now().isoformat()),updated_by=who,updated_at=now().isoformat(),revision=old.get('revision',0)+1)
  if state=='done':task.update(done_by=old.get('done_by',who) if old.get('state')=='done' else who,done_at=old.get('done_at',now().isoformat()) if old.get('state')=='done' else now().isoformat())
  db.execute('INSERT OR REPLACE INTO desk_tasks132 VALUES (?,?)',(ident,json.dumps(task,ensure_ascii=False)))
 operators131.audit(store,'Tarefa '+state,key,{'id':ident,'owner':task['owner']});return task
def save_case(store,b):
 who=operator();key=b.get('key');stage=b.get('stage')
 if stage not in STAGES:raise ValueError('Etapa comercial inválida.')
 with store.lock,store.connect() as db:
  if not db.execute('SELECT 1 FROM municipalities WHERE key=?',(key,)).fetchone():raise ValueError('Município não encontrado.')
  row=db.execute('SELECT value FROM desk_cases132 WHERE key=?',(key,)).fetchone();old=json.loads(row[0]) if row else {}
  if b.get('revision',0)!=old.get('revision',0):raise ValueError('Atendimento alterado. Atualize antes de salvar.')
  seller=text(b,'seller',120)
  if stage=='encaminhado' and not seller:raise ValueError('Informe o vendedor que receberá o lead.')
  handoff=b.get('handoff_state',old.get('handoff_state',''))
  if stage=='encaminhado' and not handoff:handoff='encaminhado'
  if handoff not in ('','encaminhado','assumido','devolvido'):raise ValueError('Situação do encaminhamento inválida.')
  if handoff and not seller:raise ValueError('Informe o vendedor do encaminhamento.')
  c=dict(handoff_state=handoff,key=key,stage=stage,owner=owner(b.get('owner')),seller=seller,notes=text(b,'notes',4000),revision=old.get('revision',0)+1,updated_at=now().isoformat(),updated_by=who)
  db.execute('INSERT OR REPLACE INTO desk_cases132 VALUES (?,?)',(key,json.dumps(c,ensure_ascii=False)))
  if stage=='encaminhado' and (old.get('stage')!=stage or old.get('seller')!=seller):
   db.execute('INSERT INTO desk_events132 VALUES (?,?,?,?,?,?)',(secrets.token_hex(12),now().isoformat(),who,key,'lead',json.dumps({'seller':seller})))
 operators131.audit(store,'Atendimento: '+STAGES[stage],key,{'owner':c['owner'],'seller':seller});return c
def call(store,b):
 who=operator();key=b.get('key');outcome=b.get('outcome');ident=b.get('id','');number=text(b,'number',60)
 if outcome not in OUTCOMES or not re.fullmatch('[a-f0-9]{24}',ident):raise ValueError('Registro de ligação inválido.')
 retry=text(b,'retry',40)
 if retry:retry=parse_time(retry).isoformat(timespec='seconds')
 if outcome=='retornar' and not retry:raise ValueError('Informe quando retornar a ligação.')
 value={'outcome':outcome,'number':number,'notes':text(b,'notes',4000),'retry':retry}
 with store.lock,store.connect() as db:
  if not db.execute('SELECT 1 FROM municipalities WHERE key=?',(key,)).fetchone():raise ValueError('Município não encontrado.')
  old=db.execute('SELECT key,kind,value FROM desk_events132 WHERE id=?',(ident,)).fetchone()
  if old:
   if old!=(key,'call',json.dumps(value,ensure_ascii=False)):raise ValueError('Identificador já utilizado.')
   return {'ok':True}
  db.execute('INSERT INTO desk_events132 VALUES (?,?,?,?,?,?)',(ident,now().isoformat(),who,key,'call',json.dumps(value,ensure_ascii=False)))
  if outcome in ('atendeu','whatsapp_informado','sem_whatsapp'):
   timestamp=now().isoformat(timespec='seconds')
   db.execute('INSERT INTO interactions VALUES (?,?,?,?,?,?,?,?,?,?)',(ident,key,timestamp,'contact','other','camara',number,None,None,'Ligação: '+outcome+' · '+value['notes']+' · Operador: '+who))
   local=json.loads(db.execute('SELECT local FROM municipalities WHERE key=?',(key,)).fetchone()[0]);local['last_contact']=timestamp[:10]
   if local.get('commercial','Não contatado')=='Não contatado':local['commercial']='Contatado'
   db.execute('UPDATE municipalities SET local=? WHERE key=?',(json.dumps(local,ensure_ascii=False),key))
 operators131.audit(store,'Ligação: '+outcome,key,value);return {'ok':True}
def phones(item):
 import app
 fields=item['fields'];numbers=set()
 for field in ('Telefone Planilha Original','Telefones Coletados no Site','WhatsApp(s) da Câmara (Botões/Links)'):
  numbers.update(app.phone_numbers(fields.get(field,'')))
 for number,meta in item['local'].get('whatsapp_links',{}).get('camara',{}).items():
  if re.fullmatch(r'55\d{10,11}',number):numbers.add(number)
 status=item['local'].get('phone_status',{}).get('camara',{})
 confirmed=any(status.get(n,{}).get('whatsapp_verified') is True for n in numbers)
 return sorted(numbers),confirmed

def summary(store,q,who):
 selected=q.get('owner',['me'])[0];selected=who if selected=='me' else selected
 if selected not in (*operators131.NAMES,'all',None):raise ValueError('Escolha um responsável válido.')
 start,end=period(q,now().date());today=now().date();route_id=q.get('route',[''])[0]
 with store.connect() as db:
  items={k:{'key':k,'fields':{**json.loads(s),**json.loads(o)},'local':json.loads(l)} for k,s,o,l in db.execute('SELECT key,source,overrides,local FROM municipalities')}
  routes=[dict(json.loads(v),id=k) for k,v in db.execute('SELECT id,value FROM commercial_routes')]
  cases={k:json.loads(v) for k,v in db.execute('SELECT key,value FROM desk_cases132')};tasks=[json.loads(v) for v, in db.execute('SELECT value FROM desk_tasks132')]
  events=[dict(id=i,at=t,operator=o,key=k,kind=kind,**json.loads(v)) for i,t,o,k,kind,v in db.execute('SELECT * FROM desk_events132 ORDER BY timestamp,id')]
  # Historical authors stay unknown unless recorded explicitly. Never infer from route owner.
  authors={}
  for table in ('smtp_attempts','wa_sender_attempts'):
   for i,v in db.execute('SELECT id,value FROM '+table):authors[i]=json.loads(v).get('operator')
  for o,d in db.execute('SELECT operator,detail FROM operator_audit'):
   d=json.loads(d)
   if d.get('id'):authors.setdefault(d['id'],o)
  checks=whatsapp_send126.states(db)
  interactions=[]
  for i,k,t,kind,channel,target,recipient,pdf,notes in db.execute("SELECT id,municipality_key,timestamp,kind,channel,target,recipient,pdf_name,notes FROM interactions WHERE NOT EXISTS (SELECT 1 FROM interaction_corrections c WHERE c.id=interactions.id AND c.active=0)"):
   if channel=='whatsapp' and kind=='sent' and not whatsapp_send126.allowed(items.get(k,{}).get('local',{}),target,recipient,checks.get(i)):continue
   m=re.search(r' · Operador: (Jeff|Lara|Pai)$',notes or '')
   interactions.append(dict(id=i,key=k,at=t,kind=kind,channel=channel,pdf=bool(pdf),operator=authors.get(i) or (m[1] if m else None)))
 contacted_legacy={k for k,i in items.items() if i['local'].get('last_contact') or i['local'].get('commercial','Não contatado')!='Não contatado'}
 wanted_routes=[r for r in routes if r['id']==route_id] if route_id else [r for r in routes if selected=='all' or r.get('owner')==selected]
 if route_id and not wanted_routes:raise ValueError('Rota não encontrada.')
 keys=set(items) if selected=='all' and not route_id else {k for r in wanted_routes for k in r.get('keys',[])}
 latest_calls={v['key']:v for v in events if v['kind']=='call'}
 if not route_id:
  keys.update(k for k,v in latest_calls.items() if v.get('operator')==selected and v.get('retry'))
  keys.update(k for k,c in cases.items() if c.get('owner')==selected)
  keys.update(t['key'] for t in tasks if t.get('owner')==selected and t.get('key'))
 def inside(v):
  try:return start<=parse_time(v).date()<=end
  except ValueError:return False
 def mine(v):return selected=='all' or v.get('operator')==selected
 activity=[v for v in interactions if v['kind']=='sent' and (not route_id or v['key'] in keys) and mine(v) and inside(v['at'])]
 calls=[v for v in events if v['kind']=='call' and (not route_id or v['key'] in keys) and mine(v) and inside(v['at'])]
 leads=[v for v in events if v['kind']=='lead' and (not route_id or v['key'] in keys) and mine(v) and inside(v['at'])]
 contacted=contacted_legacy|{v['key'] for v in interactions}|{v['key'] for v in events if v['kind']=='call' and v['outcome'] in ('atendeu','whatsapp_informado','sem_whatsapp')}
 last_call={v['key']:v for v in events if v['kind']=='call'}
 sent_keys={v['key'] for v in interactions if v['kind']=='sent'}
 pdf_keys={v['key'] for v in interactions if v['pdf'] and v['kind']=='sent'}
 city_rows=[];queue=[];funnel={k:0 for k in STAGES}
 for key in sorted(keys):
  if key not in items:continue
  i=items[key];c=cases.get(key,{});nums,confirmed=phones(i);was=key in contacted or bool(i['local'].get('last_contact')) or i['local'].get('commercial','Não contatado')!='Não contatado';stage=c.get('stage') or ('aguardando' if key in sent_keys else 'contactada' if was else 'a_contactar');funnel[stage]+=1
  row=dict(key=key,name=i['fields'].get('Município',key),uf=i['fields'].get('UF',''),contacted=was,stage=stage,case=c,numbers=nums,whatsapp=confirmed,pdf=key in pdf_keys)
  city_rows.append(row)
  if not confirmed and stage not in ('ganho','perdido'):
   previous=last_call.get(key);retry=previous.get('retry') if previous else ''
   queue.append({**row,'reason':'Ligar e pedir WhatsApp' if nums else 'Buscar contato','last_call':previous,'deferred':bool(retry and parse_time(retry)>now())})
 callbacks=[v for v in queue if (v.get('last_call') or {}).get('retry')]
 visible_tasks=[t for t in tasks if (selected=='all' or t.get('owner')==selected or t.get('state')=='done' and t.get('done_by')==selected and inside(t.get('done_at'))) and (not route_id or t.get('key') in keys)]
 for t in visible_tasks:t['overdue']=t['state']=='pending' and bool(t['due']) and parse_time(t['due'])<now();t['today']=bool(t['due']) and parse_time(t['due']).date()==today
 visible_tasks.sort(key=lambda t:(t['state']!='pending',not t['overdue'],t['due'] or '9999',t['title']))
 mail_error='';mails=[]
 try:
  c=inbox131.credential(store)
  if c['username']:mails=inbox131.rows(store,inbox131.account(c))
 except ValueError as e:mail_error=str(e)
 unread=[v for v in mails if not v.get('read') and (v.get('key') in keys or selected=='all' and not route_id)]
 daily={};
 for v in activity:
  day=parse_time(v['at']).date().isoformat();d=daily.setdefault(day,{'day':day,'whatsapp':0,'email':0,'pdf':0});d[v['channel']]=d.get(v['channel'],0)+1;d['pdf']+=int(v['pdf'])
 return dict(operator=who,owner=selected,period={'start':str(start),'end':str(end)},routes=[dict(r,total=len([k for k in r.get('keys',[]) if k in items]),contacted=sum(k in contacted for k in r.get('keys',[]))) for r in routes],cities=city_rows,queue=queue,callbacks=callbacks,tasks=visible_tasks,cases=cases,metrics=dict(cities=len(city_rows),contacted=sum(v['contacted'] for v in city_rows),uncontacted=sum(not v['contacted'] for v in city_rows),sends=len(activity),whatsapp=sum(v['channel']=='whatsapp' for v in activity),email=sum(v['channel']=='email' for v in activity),pdf=sum(v['pdf'] for v in activity),unique_sent=len({v['key'] for v in activity}),calls=len(calls),leads=len(leads),lead_cities=len({v['key'] for v in leads}),assumed=sum(v['case'].get('handoff_state')=='assumido' for v in city_rows),conversations=sum(v['stage']=='conversa' for v in city_rows),overdue=sum(t['overdue'] for t in visible_tasks)+sum(parse_time(v['last_call']['retry'])<now() for v in callbacks),today=sum(t['state']=='pending' and t['today'] for t in visible_tasks)+sum(parse_time(v['last_call']['retry']).date()==today for v in callbacks),done=sum(t['state']=='done' and inside(t.get('done_at')) and (selected=='all' or t.get('done_by')==selected) for t in tasks if not route_id or t.get('key') in keys),unread=len(unread)),activity=activity,daily=list(sorted(daily.values(),key=lambda x:x['day'])),funnel=funnel,stages=STAGES,unread=[{'id':v['id'],'key':v.get('key'),'subject':v['subject'],'from':v['from']} for v in unread[:50]],mail_error=mail_error,shared_mail=sum(not v.get('read') and not v.get('key') for v in mails),recent=[v for v in reversed(events) if (not route_id or v['key'] in keys) and mine(v) and inside(v['at'])][:100])
