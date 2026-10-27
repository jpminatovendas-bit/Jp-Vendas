const fs = require('fs');
const path = require('path');
function arg(name, fallback = '') {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? (process.argv[i + 1] || '') : fallback;
}
function normal(v) { return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase(); }
function field(row, ...names) { for (const n of names) if (row[n] !== undefined && String(row[n]).trim() !== '') return String(row[n]).trim(); return ''; }
function digits(v) { return String(v).replace(/\D/g, ''); }
function numeric(v) { const d = digits(v); return d ? BigInt(d).toString() : ''; }
function safe(v) { return normal(v).replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/g, '').slice(0, 120) || 'SEM_NOME'; }
function files(p) {
  if (!fs.existsSync(p)) throw new Error('Caminho não encontrado: ' + p);
  if (fs.statSync(p).isFile()) return [p];
  return fs.readdirSync(p, {withFileTypes:true}).flatMap(e => files(path.join(p, e.name)));
}
function parseCsv(text) {
  // Identifica separador fora de aspas; preserva quebras de linha em campos.
  const first = text.split(/\r?\n/, 1)[0];
  const delim = first.split(';').length >= first.split(',').length ? ';' : ',';
  const rows=[]; let row=[], cell='', quoted=false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (c==='"') { if (quoted && text[i+1]==='"') {cell+='"';i++;} else quoted=!quoted; }
    else if (!quoted && c===delim) {row.push(cell);cell='';}
    else if (!quoted && (c==='\n'||c==='\r')) { if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''; }
    else cell+=c;
  }
  if(quoted)throw new Error('CSV com aspas não fechadas.');
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
  return rows;
}
function records(matrix) {
  const index=matrix.findIndex(r => r.some(v=>['DS_CARGO','DESCRICAO_CARGO','CARGO'].includes(normal(v))));
  if(index<0)throw new Error('Cabeçalho de cargo não encontrado. Use a consulta de candidatos do TSE.');
  const headers=matrix[index].map(v=>normal(v).replace(/^\uFEFF/,''));
  const has=names=>names.some(n=>headers.includes(n));
  if(!has(['DS_SIT_TOT_TURNO','DESC_SIT_TOT_TURNO','DS_SITUACAO_TOTALIZACAO','SITUACAO']))throw new Error('Coluna de resultado eleitoral não encontrada.');
  return matrix.slice(index+1).filter(r=>r.some(v=>String(v??'').trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}
async function read(file) {
  if(/\.csv$/i.test(file)) {
    const b=fs.readFileSync(file); let s=b.toString('utf8');
    if(s.includes('\uFFFD'))s=new TextDecoder('windows-1252').decode(b);
    return records(parseCsv(s.replace(/^\uFEFF/,'')));
  }
  let ExcelJS;try{ExcelJS=require('exceljs');}catch{throw new Error('Para ler XLSX, execute npm install na pasta do programa.');}
  const book=new ExcelJS.Workbook();await book.xlsx.readFile(file);
  const out=[];
  for(const sheet of book.worksheets){const matrix=[];sheet.eachRow(r=>matrix.push(r.values.slice(1).map(v=>v&&typeof v==='object'?(v.result??v.text??(v.richText||[]).map(t=>t.text).join('')):v)));if(matrix.some(r=>r.some(v=>['DS_CARGO','DESCRICAO_CARGO','CARGO'].includes(normal(v)))))out.push(...records(matrix));}
  if(!out.length)throw new Error('Nenhuma aba com dados de candidatos encontrada em '+file);
  return out;
}
function elected(row) {
  const s=normal(field(row,'DS_SIT_TOT_TURNO','DESC_SIT_TOT_TURNO','DS_SITUACAO_TOTALIZACAO','SITUACAO'));
  return s.startsWith('ELEITO')||s==='MEDIA'||s==='QP'||s==='QUOCIENTE PARTIDARIO';
}
function writeCsv(file, rows) { const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';fs.writeFileSync(file,'\uFEFF'+rows.map(r=>r.map(q).join(';')).join('\r\n'),'utf8'); }
async function main() {
  const uf=normal(arg('uf'));const year=Number(arg('ano','2004'));
  const input=arg('planilhas');const photos=arg('fotos');const municipality=normal(arg('municipio'));
  if(!/^[A-Z]{2}$/.test(uf)||!input||!photos||!Number.isInteger(year))throw new Error('Uso: node extrair-pastas.js --uf RS --planilhas "pasta da planilha" --fotos "pasta das fotos" [--ano 2004] [--municipio "Nome"]');
  const out=path.resolve(arg('saida',`fotos_eleitos_${uf}_${year}`));
  const sheets=files(path.resolve(input)).filter(f=>/\.(csv|xlsx)$/i.test(f)&&!path.basename(f).startsWith('~$'));
  if(!sheets.length)throw new Error('Nenhum CSV ou XLSX encontrado. Descompacte o ZIP da consulta de candidatos primeiro.');
  const imageRoot=path.resolve(photos);
  if(!fs.statSync(imageRoot).isDirectory())throw new Error('As fotos devem estar em uma pasta descompactada.');
  if(out===imageRoot||out.startsWith(imageRoot+path.sep))throw new Error('A pasta de saída deve ficar fora da pasta de fotos de entrada.');
  const images=files(imageRoot).filter(f=>/\.(png|jpe?g|webp|bmp|tiff?)$/i.test(f));
  const byBase=new Map();const byId=new Map();
  function put(m,k,f){if(k){if(!m.has(k))m.set(k,[]);m.get(k).push(f);}}
  for(const f of images){const b=path.basename(f,path.extname(f));put(byBase,normal(b),f);for(const t of new Set((b.match(/\d+/g)||[]).map(numeric)))put(byId,t,f);}
  const selected=new Map();let skippedYear=0;
  for(const f of sheets){console.log('Lendo: '+f);for(const r of await read(f)){
    if(normal(field(r,'SG_UF','SIGLA_UF','UF'))!==uf)continue;
    const y=Number(field(r,'ANO_ELEICAO','ANO'));
    if(!y)throw new Error('Ano da eleição ausente em '+f+'. É necessário para impedir cruzamento de anos.');
    if(y!==year){skippedYear++;continue;}
    if(normal(field(r,'DS_CARGO','DESCRICAO_CARGO','CARGO'))!=='VEREADOR'||!elected(r))continue;
    const city=field(r,'NM_UE','NOME_UE','NM_MUNICIPIO','NOME_MUNICIPIO','MUNICIPIO');
    if(municipality&&normal(city)!==municipality)continue;
    const id=field(r,'SQ_CANDIDATO','SEQ_CANDIDATO');
    if(!city||!id)throw new Error('Eleito sem município ou identificador em '+f);
    const key=[normal(city),numeric(id)].join('|');
    if(!selected.has(key))selected.set(key,r);
  }}
  if(!selected.size)throw new Error(`Nenhum vereador eleito em ${year} encontrado para ${uf}${municipality?' / '+municipality:''}. Registros de outros anos ignorados: ${skippedYear}.`);
  fs.mkdirSync(out,{recursive:true});
  const report=[['uf','municipio','ano','nome_completo','nome_urna','sq_candidato','situacao','status_foto','foto_origem','foto_saida']];
  // Homônimos do mesmo município ficam em subpastas; o nome da foto não recebe números.
  const nameCounts=new Map();
  for(const r of selected.values()){
    const city=field(r,'NM_UE','NOME_UE','NM_MUNICIPIO','NOME_MUNICIPIO','MUNICIPIO');
    const name=field(r,'NM_CANDIDATO','NOME_CANDIDATO')||field(r,'NM_URNA_CANDIDATO','NOME_URNA_CANDIDATO');
    const key=safe(city)+'|'+safe(name);nameCounts.set(key,(nameCounts.get(key)||0)+1);
  }
  let found=0,missing=0,ambiguous=0;
  for(const r of selected.values()){
    const city=field(r,'NM_UE','NOME_UE','NM_MUNICIPIO','NOME_MUNICIPIO','MUNICIPIO');
    const id=field(r,'SQ_CANDIDATO','SEQ_CANDIDATO');const name=field(r,'NM_CANDIDATO','NOME_CANDIDATO');const ballot=field(r,'NM_URNA_CANDIDATO','NOME_URNA_CANDIDATO');
    let matches=[];
    if(year===2004){const ue=digits(field(r,'SG_UE','CD_UE','CODIGO_UE'));if(!ue)throw new Error('Unidade eleitoral ausente para '+name);matches=byBase.get(`F${uf}${ue}_${digits(id).padStart(5,'0')}_DIV`)||[];}
    else matches=byId.get(numeric(id))||[];
    let status='FOTO NAO ENCONTRADA',dest='';
    if(matches.length===1){const folder=path.join(out,safe(city),String(year));const duplicate=nameCounts.get(safe(city)+'|'+safe(name||ballot))>1;dest=path.join(duplicate?path.join(folder,'HOMONIMOS',digits(id)):folder,`${safe(name||ballot)}${path.extname(matches[0]).toLowerCase()}`);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(matches[0],dest);status='ENCONTRADA';found++;}
    else if(matches.length>1){status='AMBIGUA - REVISAR';ambiguous++;}else missing++;
    report.push([uf,city,year,name,ballot,id,field(r,'DS_SIT_TOT_TURNO','DESC_SIT_TOT_TURNO','DS_SITUACAO_TOTALIZACAO','SITUACAO'),status,matches.join(' | '),dest?path.relative(out,dest):'']);
  }
  writeCsv(path.join(out,`relatorio_${uf}_${year}.csv`),report);
  console.log(`Eleitos: ${selected.size} | Fotos encontradas: ${found} | Não encontradas: ${missing} | Ambíguas: ${ambiguous}`);
  console.log('Saída: '+out);
}
if(require.main===module)main().catch(e=>{console.error('ERRO: '+e.message);process.exitCode=1;});
module.exports={parseCsv,records,elected};
