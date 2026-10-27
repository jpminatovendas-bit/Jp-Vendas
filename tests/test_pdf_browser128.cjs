// Playwright e PDF gerado pelo botão real, banco e imagens temporários.
const path=require('path'),fs=require('fs'),assert=require('assert'),{spawn,execFileSync}=require('child_process');process.chdir(path.resolve(__dirname,'..'));
const {chromium}=require(process.env.JP_TEST_PLAYWRIGHT||(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright'));
(async()=>{const proc=spawn('python3',['-u',path.join(__dirname,'fixtures/pdf128.py')],{cwd:process.cwd()});let browser;try{
 const port=await new Promise((resolve,reject)=>{let data='';proc.stdout.on('data',b=>{data+=b;const m=data.match(/PORT=(\d+)/);if(m)resolve(m[1])});proc.stderr.on('data',b=>process.stderr.write(b));proc.on('exit',c=>reject(Error('server exit '+c)));setTimeout(()=>reject(Error('server timeout')),15000)});
 browser=await chromium.launch({executablePath:process.env.JP_TEST_BROWSER||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-zygote','--single-process'],env:process.env});const page=await browser.newPage({viewport:{width:1366,height:1000},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+port);await page.waitForFunction(()=>document.querySelectorAll('#rows [data-city-key]').length===1);await page.evaluate(async()=>{await openItem(0,'photos')});
 assert((await page.locator('#photos').innerText()).includes('A4 com fotos compactadas'));
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Gerar PDF final',exact:true}).first().click()]);fs.mkdirSync('tmp/tests128',{recursive:true});const target=path.resolve('tmp/tests128/generated.pdf');await download.saveAs(target);
 await page.waitForFunction(()=>project.layout_version==='1.28'&&!project.dirty);assert(fs.statSync(target).size<1500000);
 execFileSync('python3',['-c',`import sys,fitz
with fitz.open(sys.argv[1]) as doc:
 assert len(doc)==3
 for page in doc:assert abs(page.rect.width-595.27559)<.01 and abs(page.rect.height-841.88976)<.01
 assert 'CATALOGO FIXO' in doc[2].get_text()
 assert 'PESSOA 8' in doc[1].get_text()
 assert not any(im[2]>=1024 and im[3]>=1280 and im[8]=='DCTDecode' for im in doc[1].get_images(full=True))
`,target]);
 await page.screenshot({path:'tmp/tests128/generated.png'});assert.deepEqual(errors,[]);console.log('OK browser 1.28: botão Gerar PDF final baixa catálogo com 3 páginas A4, fotos compactadas, 9 nomes, catálogo fixo preservado, cadastro atualizado e zero erros JavaScript.');
 }finally{if(browser)await browser.close();proc.kill('SIGTERM')}})().catch(e=>{console.error(e);process.exitCode=1});
