// Entire USA collaborator page with a fake session and mocked endpoints; no live writes.
const {chromium}=require(process.env.TRACKING_PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');process.env.VITE_SUPABASE_URL='https://yard-test.supabase.co';process.env.VITE_SUPABASE_ANON_KEY='test-anon-key';
 const {createServer}=await import(require('node:url').pathToFileURL(path.join(root,'node_modules/vite/dist/node/index.js')).href);const server=await createServer({root,server:{host:'127.0.0.1',port:5173,strictPort:true}});await server.listen();
 const browser=await chromium.launch({headless:true,executablePath:process.env.TRACKING_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote','--single-process','--disable-software-rasterizer']});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const user={id:'10000000-0000-0000-0000-000000000003',email:'collaborator@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
 const token=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test-signature'].join('.');
 await context.addInitScript(({user,token})=>localStorage.setItem('sb-yard-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{user,token});
 let admin=false;const calls=[];let events=[];const receipt={id:'30000000-0000-0000-0000-000000000001',vin:'1HGCM82633A004352',yard_name:'Yarda de prueba',yard_id:'yard-test',received_at:'2026-05-01T15:00:00Z',status:'PENDING_REVIEW',import_management_id:null};
 await context.route('https://yard-test.supabase.co/**',route=>{
  const url=route.request().url(),body=route.request().postDataJSON();calls.push({url,body});
  const reply=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  if(url.includes('/auth/v1/user'))return reply(user);
  if(url.includes('/functions/v1/usa-yard-manager')){
   if(body.action==='access')return reply({success:true,admin,collaborator:true,yards:[{id:'yard-test',name:'Yarda de prueba'}]});
   if(body.action==='list')return reply({success:true,rows:[receipt]});
   if(body.action==='photos')return reply({success:true,files:[]});
  }
  if(url.includes('/rpc/eyr_tracking_yard_v1')){
   assert.equal(body.p_reception_id,receipt.id);assert(!('p_source_id'in body));
   if(body.p_action==='save_event'){const old=events.find(event=>event.code===body.p_code);assert.equal(body.p_expected_revision,old?.revision||0);events=[...events.filter(e=>e.code!==body.p_code),{code:body.p_code,date:body.p_date,active:true,revision:(old?.revision||0)+1}];}
   if(body.p_action==='retract_event')events=events.map(e=>e.code===body.p_code?{...e,active:false,revision:e.revision+1}:e);
   return reply({can_record:true,can_publish_photos:false,mode:'USA_YARD',events,photos:[]});
  }
  if(url.includes('/rpc/eyr_tracking_admin_v1'))return reply({can_record:false,can_publish_photos:true,mode:'RECEPTION_ONLY',events:[],photos:[]});
  return reply([]);
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5173/usa');await page.getByRole('button',{name:/1HGCM82633A004352/}).click();await page.getByRole('heading',{name:'Actualizar estatus del vehículo en USA'}).waitFor();
 assert.equal((await page.locator('.eyr-usa-brand span').innerText()).trim(),'E&R SOLUTIONS');assert.equal(await page.getByRole('heading',{name:'Fotos para el cliente'}).count(),0);
 await page.getByLabel('Avance',{exact:true}).waitFor();
 assert.deepEqual(await page.getByLabel('Avance',{exact:true}).locator('option').allTextContents(),['Cargado en contenedor','Despachado desde USA']);
 await page.getByLabel('Fecha real · Guatemala').fill('2026-05-10');await page.getByRole('button',{name:'Guardar avance',exact:true}).click();await page.getByText('Estatus USA: Cargado en contenedor',{exact:true}).waitFor();
 await page.getByLabel('Avance',{exact:true}).selectOption('DEPARTED_USA');await page.getByLabel('Fecha real · Guatemala').fill('2026-05-20');await page.getByRole('button',{name:'Guardar avance',exact:true}).click();await page.getByText('Estatus USA: Despachado desde USA',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Retirar avance',exact:true}).click();await page.getByText('Estatus USA: Cargado en contenedor',{exact:true}).waitFor();
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width}`);}
 assert(!calls.some(call=>call.url.includes('eyr_tracking_admin_v1')),'collaborator must never call admin RPC');
 admin=true;await page.reload();await page.getByRole('button',{name:/1HGCM82633A004352/}).click();await page.getByRole('heading',{name:'Fotos para el cliente',exact:true}).waitFor();await page.getByLabel('Avance',{exact:true}).waitFor();assert.equal(await page.getByLabel('Avance',{exact:true}).count(),1,'admin has one yard-status form, plus separate photo controls');
 assert.deepEqual(errors,[]);console.log('PASS: USA collaborator sees two USA milestones for unlinked receipt, saves/retracts with correct RPC, admin photo controls preserved, correct brand, 320/390/768/1440px, zero JS errors.');await browser.close();await server.close();
})().catch(e=>{console.error(e);process.exit(1)});
