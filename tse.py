"""Leitura da consulta TSE e associação histórica das fotos da eleição de 2004."""
import csv
import io
import unicodedata
import re
from pathlib import Path
import openpyxl

def clean(value):
    return unicodedata.normalize('NFD',str(value or '')).encode('ascii','ignore').decode().strip().upper()

def number(value):
    text=str(value or '').strip()
    if re.fullmatch(r'\d+\.0',text):text=text[:-2]
    if not re.fullmatch(r'\d+',text):raise ValueError('Identificador ou unidade eleitoral inválido: '+text)
    return text

def field(record,*keys):
    return next((str(record[k]).strip() for k in keys if k in record and record[k] is not None and str(record[k]).strip()),'')

def tables(content,name):
    if Path(name).suffix.lower()=='.csv':
        try:text=content.decode('utf-8-sig')
        except UnicodeDecodeError:text=content.decode('cp1252')
        first=text.splitlines()[0] if text.splitlines() else ''
        delimiter=';' if first.count(';')>=first.count(',') else ','
        yield csv.reader(io.StringIO(text),delimiter=delimiter)
    elif Path(name).suffix.lower()=='.xlsx':
        book=openpyxl.load_workbook(io.BytesIO(content),read_only=True,data_only=True)
        try:
            for sheet in book:yield sheet.values
        finally:book.close()
    else:raise ValueError('Use a consulta de candidatos do TSE em CSV ou XLSX. Descompacte o ZIP primeiro.')

def read_candidates(content,name,uf,progress=None):
    selected={};headers_found=False;other_years=0;processed=0
    states=set("AC AL AP AM BA CE ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split())
    for matrix in tables(content,name):
        header=None
        for row in matrix:
            if header is None:
                normalized=[clean(x).replace('\ufeff','') for x in row]
                if any(x in normalized for x in ('DS_CARGO','DESCRICAO_CARGO','CARGO')):
                    header=normalized;headers_found=True
                    if not any(x in header for x in ('DS_SIT_TOT_TURNO','DESC_SIT_TOT_TURNO','DS_SITUACAO_TOTALIZACAO','SITUACAO')):
                        raise ValueError('A consulta deve conter o resultado eleitoral, para selecionar somente os eleitos.')
                continue
            processed+=1
            if progress and processed%2000==0:progress(f'Lendo a consulta: {processed:,} registros verificados',None)
            record=dict(zip(header,row))
            row_uf=clean(field(record,'SG_UF','SIGLA_UF','UF'))
            if (uf!='BR' and row_uf!=uf) or row_uf not in states:continue
            year=field(record,'ANO_ELEICAO','ANO')
            if not year:raise ValueError('Ano da eleição ausente. Não é seguro associar as fotos.')
            if number(year)!='2004':other_years+=1;continue
            if clean(field(record,'DS_CARGO','DESCRICAO_CARGO','CARGO'))!='VEREADOR':continue
            situation=clean(field(record,'DS_SIT_TOT_TURNO','DESC_SIT_TOT_TURNO','DS_SITUACAO_TOTALIZACAO','SITUACAO'))
            if not (situation.startswith('ELEITO') or situation in ('MEDIA','QP','QUOCIENTE PARTIDARIO')):continue
            city=field(record,'NM_UE','NOME_UE','NM_MUNICIPIO','NOME_MUNICIPIO','MUNICIPIO')
            name=field(record,'NM_CANDIDATO','NOME_CANDIDATO','NM_URNA_CANDIDATO','NOME_URNA_CANDIDATO')
            identifier=number(field(record,'SQ_CANDIDATO','SEQ_CANDIDATO'))
            ue=number(field(record,'SG_UE','CD_UE','CODIGO_UE'))
            if not city or not name:raise ValueError('Vereador eleito sem nome ou município.')
            candidate={'uf':row_uf,'city':city,'name':name,'id':identifier,'ue':ue,'year':2004,'situation':situation,'expected':f'F{row_uf}{ue}_{identifier.zfill(5)}_DIV'}
            key=(row_uf,clean(city),int(identifier))
            if key in selected and selected[key]['expected']!=candidate['expected']:
                raise ValueError('Candidato com identificador repetido e dados divergentes. Confira a consulta.')
            selected[key]=candidate
    if not headers_found:raise ValueError('Cabeçalhos do TSE não encontrados. A planilha de contatos das Câmaras é importada pelo outro botão.')
    if not selected:raise ValueError(f'Nenhum vereador eleito em 2004 encontrado para {uf}. Registros de outros anos ignorados: {other_years}.')
    return list(selected.values())
