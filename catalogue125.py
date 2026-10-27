"""Capa e comparativos a partir das duas páginas fornecidas pelo usuário."""
from pathlib import Path
import fitz
import data_storage
import pdf_output128

NAVY=(.07,.17,.28)
BLUE=(.04,.45,.65)
SOURCE_W,SOURCE_H=1683.75,2384.25

def rect(page,box):
 return fitz.Rect(box[0]/SOURCE_W*page.rect.width,box[1]/SOURCE_H*page.rect.height,box[2]/SOURCE_W*page.rect.width,box[3]/SOURCE_H*page.rect.height)

def fonts(store):
 return {key:Path(data_storage.template(store,name)).read_bytes() for key,name in [('bold','DejaVuSans-Bold.ttf'),('regular','DejaVuSans.ttf')]}

def text(page,box,value,size=10,bold=False,color=NAVY,align=1,buffers=None):
 key='bold' if bold else 'regular';font='jp'+key
 if buffers and buffers.get(key):page.insert_font(fontname=font,fontbuffer=buffers[key])
 else:font='hebo' if bold else 'helv'
 for step in range(0,25):
  actual=size-step*.4
  if actual<5:break
  if page.insert_textbox(rect(page,box),str(value),fontsize=actual,fontname=font,color=color,align=align)>=0:return
 raise ValueError('Texto muito longo para a página personalizada: '+str(value)[:80])

def picture(page,box,path,photographic=False):
 if not Path(path).is_file():raise ValueError('Imagem movida ou apagada: '+str(path))
 page.insert_image(rect(page,box),stream=pdf_output128.image_stream(path,rect(page,box),photographic),keep_proportion=True)

def cover(store,city,uf,crest,draft=False):
 with fitz.open(data_storage.template(store,'personalizadas-1.25.pdf')) as base:
  buffers=fonts(store);doc=fitz.open();doc.insert_pdf(base,from_page=0,to_page=0)
 page=doc[0]
 text(page,(160,1230,1525,1320),city.upper()+' - '+uf,size=20,bold=True,buffers=buffers)
 if crest:picture(page,(633,1650,1051,2048),crest)
 else:text(page,(633,1770,1051,1900),'BRASÃO PENDENTE',12,bold=True,buffers=buffers)
 if draft:text(page,(150,2350,1530,2380),'PRÉVIA - MATERIAL EM PRODUÇÃO',7,color=(.7,.2,.1),buffers=buffers)
 return doc

def build(store,item,project,pairs,draft=False):
 city=item['fields']['Município'];uf=item['fields']['UF'];crest=project.get('crest')
 doc=cover(store,city,uf,crest,draft)
 with fitz.open(data_storage.template(store,'personalizadas-1.25.pdf')) as base:
  buffers=fonts(store)
  for offset in range(0,len(pairs),9):
   doc.insert_pdf(base,from_page=1,to_page=1);page=doc[-1]
   text(page,(390,148,1330,225),city.upper()+' - '+uf,16,bold=True,buffers=buffers)
   text(page,(410,280,1320,353),'AMOSTRA DA RESTAURAÇÃO DE IMAGENS DE NOSSO BANCO\nDE DADOS LEGISLATIVO DO MUNICÍPIO DE '+city.upper(),8.5,bold=True,color=BLUE,buffers=buffers)
   text(page,(29,336,410,371),'Eleição '+str(project.get('year',2004))+' | '+project.get('period','2005–2008'),7.5,color=(.32,.42,.49),align=0,buffers=buffers)
   if crest:picture(page,(1440,70,1620,248),crest)
   else:text(page,(1430,110,1630,215),'BRASÃO\nPENDENTE',8,buffers=buffers)
   text(page,(1130,2320,1665,2360),'Página dedicada a '+city+' - '+uf,7,bold=True,align=2,buffers=buffers)
   for index,pair in enumerate(pairs[offset:offset+9]):
    x=(25,571,1118)[index%3];y=(375,894,1415)[index//3]
    text(page,(x+12,y+15,x+522,y+70),pair['name'].upper(),7.2,bold=True,buffers=buffers)
    for side,path in enumerate((pair['original'],pair.get('restored'))):
     left=x+16+side*260;box=(left,y+78,left+242,y+379)
     page.draw_rect(rect(page,box),color=None,fill=(1,1,1))
     if path:picture(page,box,path,photographic=True)
     else:text(page,(left,y+185,left+242,y+260),'AGUARDANDO\nRESTAURAÇÃO',8,color=(.45,.45,.45),buffers=buffers)
    text(page,(x+10,y+414,x+248,y+452),'ORIGINAL',7.5,bold=True,color=(.32,.42,.49),buffers=buffers)
    text(page,(x+235,y+414,x+286,y+452),'→',8,bold=True,color=BLUE,buffers=buffers)
    text(page,(x+278,y+414,x+525,y+452),'RESTAURADO',7.5,bold=True,color=BLUE,buffers=buffers)
   if draft:text(page,(40,2265,1640,2305),'PRÉVIA PARA CONFERÊNCIA - MATERIAL EM PRODUÇÃO',8,bold=True,color=(.7,.2,.1),buffers=buffers)
 try:doc.subset_fonts()
 except ImportError:pass  # PyMuPDF antigo pode exigir fontTools apenas para este refinamento.
 return doc
