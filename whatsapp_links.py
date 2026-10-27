"""Validate individual WhatsApp links without following remote redirects."""
import re
from urllib.parse import urlparse, parse_qs, unquote

def parse_link(value, normalize_phone):
    value=str(value or '').strip()
    if not value or len(value)>2048 or re.search(r'[\x00-\x20\\]',value):
        raise ValueError('Link de WhatsApp inválido.')
    p=urlparse(value)
    if p.scheme not in ('https','http') or p.username or p.password or p.fragment:
        raise ValueError('Use um link HTTP/HTTPS individual do WhatsApp.')
    try:
        if p.port not in (None,80 if p.scheme=='http' else 443):raise ValueError()
    except ValueError:raise ValueError('Porta do link de WhatsApp inválida.')
    host=p.hostname;path=unquote(p.path).rstrip('/');number='';opaque=False
    if host=='wa.me':
        if re.fullmatch(r'/[+0-9]+',path):number=path[1:]
        elif re.fullmatch(r'/message/[A-Za-z0-9_-]{4,200}',path):opaque=True
        else:raise ValueError('Use wa.me com número ou um link individual /message/.')
    elif host in ('api.whatsapp.com','web.whatsapp.com','www.whatsapp.com','whatsapp.com') and path=='/send':
        numbers=parse_qs(p.query).get('phone',[])
        if len(numbers)!=1 or not re.fullmatch(r'[+ 0-9]+',numbers[0]):raise ValueError('O link /send deve conter um único telefone.')
        number=numbers[0]
    else:raise ValueError('Endereço não reconhecido como contato individual. Grupos e canais não são aceitos.')
    if number:
        digits=re.sub(r'\D','',number)
        if not digits.startswith('55') or len(digits) not in (12,13):raise ValueError('O link deve conter telefone brasileiro com prefixo 55 e DDD.')
        number=normalize_phone(digits)
    return {'link_url':value,'link_number':number,'opaque':opaque}
