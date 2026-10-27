"""Catálogo de 10 páginas: duas personalizadas e complemento preservado."""
from pathlib import Path
import fitz
import data_storage
import pdf_output128

LAYOUT_VERSION='1.33.1'
PAGE_SIZE=(595.5,842.25)
NAVY=(.078,.208,.318)
TEAL=(0,.47,.56)
GRAY=(.29,.36,.41)

def template(store,name):return Path(data_storage.template(store,name))
def standard_path(store):
 saved=store.setting('catalogue',{})
 return Path(saved['path']) if saved.get('layout_version') in ('1.33',LAYOUT_VERSION) and saved.get('path') else template(store,'restante-1.33.pdf')
def font_buffers(store):return {k:template(store,n).read_bytes() for k,n in [('bold','DejaVuSans-Bold.ttf'),('regular','DejaVuSans.ttf')]}
def clear(page,boxes):
 for box in boxes:page.add_redact_annot(fitz.Rect(box),fill=(1,1,1),cross_out=False)
 # Delete intersecting images, rather than retaining the former municipality underneath.
 try:page.apply_redactions(images=1,graphics=0,text=0)
 except TypeError:page.apply_redactions(images=1)
def put_text(page,box,value,size=12,bold=False,color=NAVY,align=0,buffers=None):
 box=fitz.Rect(box);key='bold' if bold else 'regular';name='jp133'+key
 page.insert_font(fontname=name,fontbuffer=buffers[key])
 shape=page.new_shape()
 # Test fit in a fresh Shape so unsuccessful attempts do not paint duplicate text.
 for delta in range(0,90):
  actual=size-delta*.25
  if actual<5:break
  shape=page.new_shape()
  if shape.insert_textbox(box,str(value),fontname=name,fontsize=actual,color=color,align=align,lineheight=1.15)>=0:shape.commit();return
 raise ValueError('Texto não cabe no catálogo: '+str(value)[:80])
def image(page,box,path,photo=False):
 box=fitz.Rect(box)
 if not Path(path).is_file():raise ValueError('Imagem movida ou apagada: '+str(path))
 stream=pdf_output128.image_stream(path,box,photo)
 if not photo:
  page.insert_image(box,stream=stream,keep_proportion=True)
  return
 # A fixed clipping viewport fills each photo frame without stretching faces.
 # Keep the top of a portrait and crop only its sides or lower edge as needed.
 pixmap=fitz.Pixmap(stream)
 scale=max(box.width/pixmap.width,box.height/pixmap.height)
 width,height=pixmap.width*scale,pixmap.height*scale
 left=(box.width-width)/2
 with fitz.open() as viewport:
  frame=viewport.new_page(width=box.width,height=box.height)
  frame.insert_image(fitz.Rect(left,0,left+width,height),stream=stream,keep_proportion=False)
  page.show_pdf_page(box,viewport,0,keep_proportion=False)
def crest_image(page,box,crest,draft,buffers):
 if crest:image(page,box,crest)
 elif draft:put_text(page,box,'BRASÃO\nPENDENTE',8,True,GRAY,1,buffers)
 else:raise ValueError('Cadastre o brasão deste município antes de gerar o PDF final.')
def base_page(store,index):
 with fitz.open(template(store,'catalogo-base-1.33.pdf')) as source:
  doc=fitz.open();doc.insert_pdf(source,from_page=index,to_page=index)
 return doc

def cover(store,city,uf,crest,draft=False,pair=None,period='2005–2008'):
 doc=base_page(store,0);page=doc[0];buf=font_buffers(store)
 clear(page,[(112,242,462,296),(34,206,108,303),(460,206,562,303),(34,382,280,694),(312,382,562,694),(34,698,562,723),(34,736,562,790)])
 put_text(page,(113,243,463,295),city.upper()+' • '+uf,34,True,NAVY,1,buf)
 # All emblems on personalized pages use the municipality's registered crest.
 crest_image(page,(36,208,106,301),crest,draft,buf);crest_image(page,(464,208,559,301),crest,draft,buf)
 for box,path in [((35,384,278,692),(pair or {}).get('original')),((317,384,560,692),(pair or {}).get('restored'))]:
  if path:image(page,box,path,True)
  elif draft:put_text(page,box,'AGUARDANDO\nRESTAURAÇÃO',11,True,GRAY,1,buf)
  else:raise ValueError('Selecione o antes e depois do primeiro vereador para a capa.')
 put_text(page,(36,700,559,724),'Legislatura '+period,16,True,GRAY,0,buf)
 name=(pair or {}).get('name','vereador')
 put_text(page,(36,739,559,791),'Amostra de restauração da fotografia de '+name+',\ndisponível no acervo da JP Minato.',15,False,GRAY,0,buf)
 if draft:put_text(page,(34,795,562,810),'PRÉVIA - MATERIAL EM PRODUÇÃO',8,True,(.7,.2,.1),1,buf)
 return doc

def build(store,item,project,pairs,draft=False):
 if not pairs:raise ValueError('Selecione ao menos uma foto.')
 city=item['fields']['Município'];uf=item['fields']['UF'];crest=project.get('crest');period=project.get('period') or '2005–2008'
 doc=cover(store,city,uf,crest,draft,pairs[0],period);buf=font_buffers(store)
 for offset in range(0,len(pairs),9):
  with base_page(store,1) as src:doc.insert_pdf(src)
  page=doc[-1];boxes=[(34,103,582,129),(491,16,582,103)]
  for idx in range(9):
   x=24+184.07*(idx%3);y=171.16+175.066*(idx//3)
   boxes.extend([(x-1,y-2,x+176,y+15),(x,y+19,x+174,y+135),(x+10,y+137,x+149,y+154)])
  clear(page,boxes)
  put_text(page,(36,106,579,131),city+'/'+uf+' • Legislatura '+period,14,False,GRAY,0,buf)
  crest_image(page,(493,18,579,101),crest,draft,buf)
  for idx,pair in enumerate(pairs[offset:offset+9]):
   x=24+184.07*(idx%3);y=171.16+175.066*(idx//3)
   put_text(page,(x,y-1,x+174,y+17),pair['name'].upper(),10,True,NAVY,0,buf)
   for box,path in [((x+1,y+21,x+84,y+134),pair['original']),((x+89,y+21,x+172,y+134),pair.get('restored'))]:
    if path:image(page,box,path,True)
    elif draft:put_text(page,box,'AGUARDANDO\nRESTAURAÇÃO',6.5,False,GRAY,1,buf)
    else:raise ValueError('Importe as fotos tratadas correspondentes antes do PDF final.')
   put_text(page,(x+1,y+139,x+84,y+154),'ANTES',10,True,GRAY,1,buf)
   put_text(page,(x+89,y+139,x+172,y+154),'DEPOIS',10,True,TEAL,1,buf)
  if draft:put_text(page,(35,782,562,801),'PRÉVIA PARA CONFERÊNCIA - MATERIAL EM PRODUÇÃO',8,True,(.7,.2,.1),1,buf)
 try:doc.subset_fonts()
 except ImportError:pass
 return doc
