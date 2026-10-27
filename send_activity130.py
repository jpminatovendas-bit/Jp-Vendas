"""Resumo diário de envios válidos para filtros, sem expor mensagens ou contatos."""
from datetime import datetime,timezone,timedelta
BRAZIL=timezone(timedelta(hours=-3))

def day_of(value):
 try:
  stamp=datetime.fromisoformat(str(value).replace('Z','+00:00'))
  if stamp.tzinfo is None:stamp=stamp.replace(tzinfo=BRAZIL)
  return stamp.astimezone(BRAZIL).date().isoformat(),stamp.astimezone(BRAZIL).isoformat(timespec='seconds')
 except (ValueError,TypeError,OverflowError):return None,None

def add(summary,event):
 day,stamp=day_of(event['timestamp']);key=(day,event['channel'],event['target'])
 bins=summary.setdefault('send_days',{})
 item=bins.setdefault(key,{'day':day,'channel':event['channel'],'target':event['target'],'count':0,'last_at':None})
 item['count']+=1
 if stamp and (not item['last_at'] or stamp>item['last_at']):item['last_at']=stamp

def output(summary):
 return sorted(summary.get('send_days',{}).values(),key=lambda v:(v['day'] or '',v['channel'],v['target']))
