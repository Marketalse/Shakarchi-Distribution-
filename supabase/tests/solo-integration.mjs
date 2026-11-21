import { fileURLToPath } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE_URL || '@electric-sql/pglite')
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
process.on('uncaughtException',e=>{console.error(e.message,e.where||'',e.stack?.split('\n').filter(l=>l.includes('check.mjs')).join('\n'));process.exit(1)});
process.on('unhandledRejection', e=>{console.error(e.message,e.where||'',e.stack?.split('\n').filter(l=>l.includes('check.mjs')).join('\n'));process.exit(1)});
const db = new PGlite()
const root = fileURLToPath(new URL('../migrations/',import.meta.url))
const setupSQL=`
create role authenticated;
create role anon;
create schema auth;
create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as
$$ select string_to_array($1, '/') $$;
grant usage on schema public, auth, storage to authenticated;
grant all on storage.objects to authenticated;
alter default privileges grant all on tables to authenticated;
alter default privileges grant usage on sequences to authenticated;
`;
await db.exec(setupSQL);
for(const file of ['001_initial_schema.sql','002_basic_retail_workflows.sql'])await db.exec(await readFile(root+file,'utf8'));
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const outlet='11111111-1111-1111-1111-111111111111',sku='22222222-2222-2222-2222-222222222222';
await db.exec(`
insert into auth.users values ('${owner}'),('${other}');
insert into profiles(id,full_name,role) values('${owner}','Owner','owner'),('${other}','Other','rep');
insert into outlets(id,retail_name,lat,lng,province,area,outlet_type,assigned_rep,created_by)
values('${outlet}','Synthetic Shop',33,44,'Baghdad','Area','Grocery','${owner}','${owner}');
insert into products(id,sku,brand,product_line,flavour,wholesale_price,cost_price) values('${sku}','SYN1','Synthetic','Line','Variant',10000,6000);
`);
for(const file of ['003_solo_database_foundation.sql','004_solo_finance_operations.sql','005_owner_catalog_and_surveys.sql','006_catalog_boundaries.sql','007_product_brand_validation.sql'])
  await db.exec(await readFile(root+file,'utf8'));
await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
let sequence=100;
function id(){return '99999999-9999-4999-8999-'+String(sequence++).padStart(12,'0');}
async function rpc(name,operation,payload){return (await db.query(`select public.${name}($1,$2) as result`,[operation,JSON.stringify(payload)])).rows[0].result;}
async function balances(order){return(await db.query('select * from solo_invoice_balances where id=$1',[order])).rows[0];}
const visit=id(),order=id();
const payload={outlet_id:outlet,visit_id:visit,terms_days:7,items:[{sku_id:sku,quantity:10,price:10000}],initial_amount:60000,method:'cash'};
const issued=await rpc('issue_solo_invoice',order,payload);
assert.deepEqual(await rpc('issue_solo_invoice',order,payload),issued);
await assert.rejects(rpc('issue_solo_invoice',order,{...payload,initial_amount:50000}),/different payload/);
assert.equal(Number((await balances(order)).outstanding),40000);
assert.equal((await db.query('select count(*)::int as n from reminder_history')).rows[0].n,1);
const bad=id();
await assert.rejects(rpc('issue_solo_invoice',bad,{...payload,visit_id:id(),items:[{sku_id:sku,quantity:2,price:1}]}),/price or quantity/);
assert.equal((await db.query('select count(*)::int as n from orders where id=$1',[bad])).rows[0].n,0);
const payment=id(),receipt={order_id:order,outlet_id:outlet,kind:'receipt',amount:40000,method:'cash'};
const posted=await rpc('post_solo_collection',payment,receipt);
await rpc('post_solo_collection',payment,receipt);
assert.equal((await balances(order)).payment_status,'Paid');
assert.equal((await db.query('select status from collection_reminders where order_id=$1',[order])).rows[0].status,'settled');
await assert.rejects(rpc('post_solo_collection',id(),receipt),/exceeds/);
const refund=id();
await rpc('post_solo_collection',refund,{...receipt,kind:'refund',receipt_id:posted.entry_id,amount:5000,reason:'Synthetic refund'});
assert.equal(Number((await balances(order)).outstanding),5000);
assert.equal((await db.query('select status from collection_reminders where order_id=$1',[order])).rows[0].status,'pending');
await assert.rejects(rpc('post_solo_collection',id(),{...receipt,kind:'refund',receipt_id:posted.entry_id,amount:36000,reason:'Too much'}),/exceeds/);
const initial=(await db.query("select id from payments where operation_id=$1",[order])).rows[0].id;
const correction=id();
await rpc('post_solo_collection',correction,{...receipt,kind:'correction',receipt_id:initial,amount:50000,reason:'Correct amount'});
assert.equal(Number((await balances(order)).outstanding),15000);
await assert.rejects(rpc('post_solo_collection',id(),{...receipt,kind:'correction',receipt_id:initial,amount:50000,reason:'Again'}),/prior correction/);
await assert.rejects(db.query('update payments set amount=1 where id=$1',[initial]),/permission denied/);
assert.equal(Number((await db.query('select amount from payments where id=$1',[initial])).rows[0].amount),60000);
const future=new Date(Date.now()+7*86400000).toISOString();
await rpc('reschedule_solo_reminder',id(),{order_id:order,scheduled_at:future});
const rows=await db.query('select * from reminder_history where order_id=$1',[order]);
assert.equal(rows.rows.at(-1).reason,'rescheduled');
await assert.rejects(rpc('reschedule_solo_reminder',id(),{order_id:order,scheduled_at:'2000-01-01T00:00:00Z'}),/Future/);
await assert.rejects(rpc('post_solo_collection',id(),{...receipt,outlet_id:other}),/mismatch/);
await assert.rejects(db.query(
 "insert into products(sku,product_line,flavour,wholesale_price,brand) values('MISSING-BRAND','Test','Missing',100,'Typed name only')"
),error=>error.code==='23502' && /Choose a brand in brand_id/.test(error.message));
await assert.rejects(db.query(
 "insert into products(sku,product_line,flavour,wholesale_price,brand_id) values('UNKNOWN-BRAND','Test','Unknown',100,$1)",[id()]
),error=>error.code==='23503' && /does not exist/.test(error.message));
const competitorImport=id();
await rpc('import_solo_data',competitorImport,{kind:'brands',rows:[{name:'Approved competitor',is_own:false}]});
const competitorBrand=(await db.query("select id from survey_brands where name='Approved competitor'")).rows[0].id;
await rpc('import_solo_data',id(),{kind:'products',rows:[
 {sku:'COMP-1',product_line:'Competitor line',flavour:'Variant',brand_id:competitorBrand,wholesale_price:5000},
 {sku:'COMP-2',product_line:'Competitor line',flavour:'Other',brand_id:competitorBrand}
]});
const competitorProduct=(await db.query("select id from products where sku='COMP-1'")).rows[0].id;
assert.equal((await db.query('select * from solo_active_catalog where id=$1',[competitorProduct])).rows.length,0);
assert.equal((await db.query('select * from solo_competitor_catalog')).rows.length,2);
const ownBrand=(await db.query('select brand_id from products where id=$1',[sku])).rows[0].brand_id;
await assert.rejects(db.query('update products set is_own_brand=true where id=$1',[competitorProduct]),/classification/);
await assert.rejects(db.query('update survey_brands set is_own=true where id=$1',[competitorBrand]),/associated products/);
const competitorAttempt=id();
await assert.rejects(rpc('issue_solo_invoice',competitorAttempt,{...payload,visit_id:id(),items:[{sku_id:competitorProduct,quantity:1,price:5000}]}),/Competitor products/);
assert.equal((await db.query('select * from orders where id=$1',[competitorAttempt])).rows.length,0);
await db.exec('reset role');
assert.equal((await db.query('select * from wsd_private.operations where id=$1',[competitorAttempt])).rows.length,0);
await db.exec('set role authenticated');
await assert.rejects(rpc('import_solo_data',id(),{kind:'observations',rows:[{
 outlet_id:outlet,visit_id:id(),kind:'competitor_price',brand_id:ownBrand,product_id:sku,price:100
}]}),/active competitor/);
await rpc('import_solo_data',id(),{kind:'observations',rows:[{
 outlet_id:outlet,visit_id:id(),kind:'competitor_price',brand_id:competitorBrand,product_id:competitorProduct,price:5000
}]});
assert.equal((await db.query('select * from market_observations')).rows.length,1);
const version=id(),questions=[{id:'availability',label:'Available?',type:'boolean',required:true},{id:'facings',label:'Facings',type:'number',required:true}];
await rpc('publish_solo_survey',version,{title:'Shelf check',questions});
const run={brand_id:competitorBrand,product_id:competitorProduct,outlet_id:outlet,visit_id:visit,version_id:version,answers:{availability:false,facings:0}};
await rpc('submit_solo_survey',id(),run);
await assert.rejects(rpc('submit_solo_survey',id(),{...run,answers:{availability:'yes',facings:2}}),/Invalid answer/);
await assert.rejects(rpc('submit_solo_survey',id(),{...run,answers:{facings:2}}),/Required/);
const brandImport=id();
await rpc('import_solo_data',brandImport,{kind:'brands',rows:[{name:'Import Brand',is_own:true}]});
const brand=(await db.query("select id from survey_brands where name='Import Brand'")).rows[0].id;
await assert.rejects(rpc('import_solo_data',id(),{kind:'products',rows:[
 {sku:'SYN2',product_line:'L2',flavour:'V2',brand_id:brand,wholesale_price:5000},
 {sku:'SYN3',product_line:'L3',flavour:'V3',brand_id:brand,wholesale_price:-1}]}),/Valid SKU/);
assert.equal((await db.query("select count(*)::int as n from products where sku='SYN2'")).rows[0].n,0);
await db.query('update survey_brands set active=false where id=(select brand_id from products where id=$1)',[sku]);
await assert.rejects(rpc('issue_solo_invoice',id(),{...payload,visit_id:id()}),/inactive/);
await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
assert.equal((await db.query('select * from solo_invoice_balances')).rows.length,0);
await assert.rejects(db.query("insert into survey_brands(name,is_own) values('Unauthorized brand',false)"),/row-level security/);
assert.equal((await db.query('update products set active=false where id=$1 returning id',[sku])).rows.length,0);
assert.equal((await db.query('select * from products')).rows.length,0);
for(const name of ['issue_solo_invoice','post_solo_collection','publish_solo_survey','reschedule_solo_reminder','import_solo_data'])
  await assert.rejects(rpc(name,id(),{}),/Owner access/);
await db.exec('reset role;set role anon;');
await assert.rejects(rpc('post_solo_collection',id(),receipt),/permission denied/);
console.log('PASS · migrations 001–007 · actionable brand validation · classification consistency · competitor invoice rejection · competitor-only surveys · invoice retry/payload/rollback · receipts/refunds/corrections · reminder lifecycle · immutable history · survey typing · atomic imports · inactive brands · owner/anon isolation');
await db.exec('reset role');
const undo=await readFile(fileURLToPath(new URL('../rollbacks/006_catalog_boundaries.sql',import.meta.url)),'utf8');
await assert.rejects(db.exec(undo),/Deactivate competitor products/);
await db.exec('rollback');
await db.query('update products set active=false where not is_own_brand');
const originalCount=(await db.query('select count(*)::int as n from products')).rows[0].n;
await db.exec(undo);
assert.equal((await db.query('select count(*)::int as n from products')).rows[0].n,originalCount);
assert.equal(Number((await db.query('select outstanding from solo_invoice_balances where id=$1',[order])).rows[0].outstanding),15000);
console.log('PASS · behavioral rollback preserves product rows and invoice balances; active competitors require deactivation.');
await assert.rejects(db.exec(await readFile(root+'008_usd_manual_fx.sql','utf8')), /approved currency conversion plan/);
await db.exec('rollback');
assert.equal((await db.query("select column_default from information_schema.columns where table_name='products' and column_name='currency'")).rows[0].column_default, "'IQD'::text");
console.log('PASS · USD cutover refuses existing monetary data without changing its currency.');
await db.close();

// The USD cutover is tested on a separate empty database.
const usdDb = new PGlite()
await usdDb.exec(setupSQL)
for (const file of ['001_initial_schema.sql', '002_basic_retail_workflows.sql']) {
  await usdDb.exec(await readFile(root + file, 'utf8'))
}
await usdDb.exec("insert into auth.users values ('" + owner + "'), ('" + other + "');" +
  "insert into profiles(id,full_name,role) values ('" + owner + "','Owner','owner'),('" + other + "','Other','rep');")
for (const file of [
  '003_solo_database_foundation.sql', '004_solo_finance_operations.sql',
  '005_owner_catalog_and_surveys.sql', '006_catalog_boundaries.sql',
  '007_product_brand_validation.sql', '008_usd_manual_fx.sql',
]) await usdDb.exec(await readFile(root + file, 'utf8'))
const usdBrand = id()
await usdDb.query("insert into survey_brands(id,name,is_own) values($1,'USD Brand',true)", [usdBrand])
await usdDb.query("insert into products(id,brand_id,product_line,flavour,sku,wholesale_price,cost_price)" +
  " values($1,$2,'USD line','Variant','USD-SKU',10,6)", [sku, usdBrand])
await usdDb.query("insert into outlets(id,retail_name,lat,lng,province,area,outlet_type,assigned_rep,created_by)" +
  " values($1,'USD Shop',33,44,'Baghdad','Test','Retail',$2,$2)", [outlet, owner])
await assert.rejects(usdDb.query("update products set currency='IQD' where id=$1", [sku]), /usd_only/)
await usdDb.exec("set role authenticated; select set_config('request.jwt.claim.sub','" + owner + "',false);")
async function usdRpc(name, operation, request) {
  return (await usdDb.query('select public.' + name + '($1,$2) as result', [operation, JSON.stringify(request)])).rows[0].result
}
const usdInvoice = id()
const usdRequest = {
  currency: 'USD', outlet_id: outlet, terms_days: 7, initial_amount: '0', method: 'cash',
  items: [{ sku_id: sku, quantity: 10, price: '10.00' }],
}
await assert.rejects(usdRpc('issue_solo_invoice', id(), { ...usdRequest, currency: 'IQD' }), /USD currency confirmation/)
await usdRpc('issue_solo_invoice', usdInvoice, usdRequest)
const rateA = id()
const rateRequest = {
  exchange_rate_used: '1500', rate_source: 'Synthetic manual parallel rate',
  valid_until: new Date(Date.now() + 3600000).toISOString(),
}
await usdRpc('publish_solo_fx_rate', rateA, rateRequest)
assert.deepEqual(await usdRpc('publish_solo_fx_rate', rateA, rateRequest), { rate_version_id: rateA })
await assert.rejects(usdRpc('publish_solo_fx_rate', id(), { ...rateRequest, exchange_rate_used: '0' }), /positive/)
const localOperation = id()
const localRequest = {
  currency: 'USD', settlement_currency: 'IQD', rate_version_id: rateA,
  source_amount: '60000', order_id: usdInvoice, outlet_id: outlet, kind: 'receipt', method: 'cash',
}
const firstReceipt = await usdRpc('post_solo_collection', localOperation, localRequest)
const snapshot = (await usdDb.query('select * from payment_fx_snapshots where operation_id=$1', [localOperation])).rows[0]
assert.equal(Number(snapshot.usd_amount), 40)
assert.equal(Number(snapshot.exchange_rate_used), 1500)
const rateB = id()
await usdRpc('publish_solo_fx_rate', rateB, { ...rateRequest, exchange_rate_used: '1600' })
assert.deepEqual(await usdRpc('post_solo_collection', localOperation, localRequest), firstReceipt)
await assert.rejects(usdRpc('post_solo_collection', id(), localRequest), /Rate changed/)
const secondReceipt = await usdRpc('post_solo_collection', id(), { ...localRequest, rate_version_id: rateB, source_amount: '16000' })
assert.equal(Number((await usdDb.query('select outstanding from solo_invoice_balances where id=$1', [usdInvoice])).rows[0].outstanding), 50)
const rateC = id()
await usdRpc('publish_solo_fx_rate', rateC, { ...rateRequest, exchange_rate_used: '1700' })
await usdRpc('post_solo_collection', id(), {
  ...localRequest, kind: 'correction', receipt_id: secondReceipt.entry_id,
  rate_version_id: rateB, source_amount: '8000', reason: 'Correct original local cash',
})
await assert.rejects(usdRpc('post_solo_collection', id(), {
  ...localRequest, kind: 'correction', receipt_id: firstReceipt.entry_id,
  rate_version_id: rateC, source_amount: '30000', reason: 'Incorrect revaluation',
}), /original rate/)
await usdRpc('post_solo_collection', id(), {
  ...localRequest, kind: 'refund', receipt_id: firstReceipt.entry_id,
  rate_version_id: rateC, source_amount: '8500', reason: 'Local refund at current rate',
})
assert.equal(Number((await usdDb.query('select outstanding from solo_invoice_balances where id=$1', [usdInvoice])).rows[0].outstanding), 60)
assert.equal(Number((await usdDb.query('select total from solo_invoice_balances where id=$1', [usdInvoice])).rows[0].total), 100)
assert.equal(Number((await usdDb.query('select usd_amount from payment_fx_snapshots where operation_id=$1', [localOperation])).rows[0].usd_amount), 40)
await assert.rejects(usdDb.query('update fx_rate_versions set exchange_rate_used=1 where id=$1', [rateA]), /permission denied/)
await assert.rejects(usdDb.query('update products set wholesale_price=1 where id=$1', [sku]), /permission denied/)
await usdRpc('update_solo_product', id(), {
  id: sku, currency: 'USD', brand_id: usdBrand, sku: 'USD-SKU', product_line: 'USD line',
  flavour: 'Variant', wholesale_price: '11.00', cost_price: '6.00', active: true,
})
assert.equal(Number((await usdDb.query('select total from solo_invoice_balances where id=$1', [usdInvoice])).rows[0].total), 100)
await assert.rejects(usdRpc('import_solo_data', id(), { kind: 'products', rows: [] }), /USD currency confirmation/)
await usdDb.exec('reset role')
const expiredRate = id()
// Insert an already-expired fixture as database administrator to test stale-rate denial.
await usdDb.query("insert into fx_rate_versions(id,exchange_rate_used,rate_timestamp,valid_until,rate_source,created_by)" +
  " values($1,1800,now()-interval '2 hours',now()-interval '1 hour','Expired test fixture',$2)", [expiredRate, owner])
await usdDb.query('update wsd_private.fx_current_rate set rate_id=$1', [expiredRate])
await usdDb.exec("set role authenticated; select set_config('request.jwt.claim.sub','" + owner + "',false);")
await assert.rejects(usdRpc('post_solo_collection', id(), { ...localRequest, rate_version_id: expiredRate }), /expired/)
assert.deepEqual(await usdRpc('post_solo_collection', localOperation, localRequest), firstReceipt)
await usdDb.exec("select set_config('request.jwt.claim.sub','" + other + "',false);")
assert.equal((await usdDb.query('select * from fx_rate_versions')).rows.length, 0)
await assert.rejects(usdRpc('publish_solo_fx_rate', id(), rateRequest), /Owner access/)
await assert.rejects(usdRpc('post_solo_collection', id(), localRequest), /Owner access/)
console.log('PASS · USD-only amounts · currency-intent checks · immutable manual rates and settlement snapshots · stale-rate rejection · partial settlements · original-rate corrections · refunds · owner isolation.')
await usdDb.exec('reset role');
await usdDb.exec(await readFile(root + '009_inactive_catalog_metadata.sql', 'utf8'));
await usdDb.exec("set role authenticated; select set_config('request.jwt.claim.sub','" + owner + "',false);");
const unpriced = {sku:'INACTIVE-TEST',brand_id:usdBrand,product_line:'Unstocked line',flavour:'Mint',active:false,wholesale_price:null,puffs:20000,units_per_carton:100,retail_price:null};
await usdRpc('import_solo_data',id(),{currency:'USD',kind:'products',rows:[unpriced]});
const inactiveProduct=(await usdDb.query("select * from products where sku='INACTIVE-TEST'")).rows[0];
assert.equal(inactiveProduct.is_own_brand,true);
assert.equal(inactiveProduct.wholesale_price,null);
assert.equal(inactiveProduct.puffs,20000);
assert.equal(inactiveProduct.units_per_carton,100);
assert.equal((await usdDb.query('select * from solo_active_catalog where id=$1',[inactiveProduct.id])).rows.length,0);
await assert.rejects(usdDb.query('update products set active=true where id=$1',[inactiveProduct.id]),/own_catalog_price_required/);
await assert.rejects(usdRpc('issue_solo_invoice',id(),{...usdRequest,items:[{sku_id:inactiveProduct.id,quantity:1,price:'0'}]}),/no rows/);
await assert.rejects(usdRpc('import_solo_data',id(),{currency:'USD',kind:'products',rows:[{...unpriced,sku:'BAD-META',puffs:1.5}]}),/whole-number/);
await usdRpc('update_solo_product',id(),{...unpriced,id:inactiveProduct.id,active:true,wholesale_price:'8.00',retail_price:'9.50',currency:'USD'});
const activated=(await usdDb.query('select * from solo_active_catalog where id=$1',[inactiveProduct.id])).rows[0];
assert.equal(Number(activated.wholesale_price),8);
assert.equal(Number(activated.retail_price),9.5);
assert.equal(Number((await usdDb.query('select total from solo_invoice_balances where id=$1',[usdInvoice])).rows[0].total),100);
console.log('PASS · inactive unpriced own catalog · activation guard · order exclusion · metadata precision · existing invoices preserved.');
await usdDb.exec('reset role');
await usdDb.exec(await readFile(root + '010_shared_visit_lifecycle.sql','utf8'));
await usdDb.exec("set role authenticated; select set_config('request.jwt.claim.sub','" + owner + "',false);");
const visitCandidate=id();
const opened=(await usdDb.query("select open_solo_visit($1,$2,'order') as id",[visitCandidate,outlet])).rows[0].id;
const resumed=(await usdDb.query("select open_solo_visit($1,$2,'survey') as id",[id(),outlet])).rows[0].id;
assert.equal(opened,resumed);
const finishOperation=id();
const finished=await usdRpc('finish_solo_visit',finishOperation,{visit_id:opened});
assert.deepEqual(await usdRpc('finish_solo_visit',finishOperation,{visit_id:opened}),finished);
assert.ok((await usdDb.query('select checked_out_at from visits where id=$1',[opened])).rows[0].checked_out_at);
const nextVisit=(await usdDb.query("select open_solo_visit($1,$2,'survey') as id",[id(),outlet])).rows[0].id;
assert.notEqual(nextVisit,opened);
await usdDb.exec("select set_config('request.jwt.claim.sub','" + other + "',false);");
await assert.rejects(usdDb.query("select open_solo_visit($1,$2,'order')",[id(),outlet]),/Owner access/);
console.log('PASS · shared order/survey shop stop · explicit finish/replay · next visit · second-user denial.');
await usdDb.exec('reset role');
await usdDb.exec(await readFile(root + '011_capture_once_location.sql','utf8'));
await usdDb.exec("set role authenticated; select set_config('request.jwt.claim.sub','" + owner + "',false);");
const locationClient=(await usdDb.query('select * from outlets where id=$1',[outlet])).rows[0];
assert.equal(locationClient.location_accuracy,null);
await assert.rejects(usdDb.query('update outlets set lat=1 where id=$1',[outlet]),/permission denied/);
await assert.rejects(usdDb.query("insert into visits(id,outlet_id,rep_id,checked_in_at,start_source,lat,lng) values($1,$2,$3,now(),'survey',33,44)",[id(),outlet,owner]),/reuse the client location/);
const correctionId=id(),correctionPayload={outlet_id:outlet,expected_updated_at:locationClient.updated_at.toISOString(),lat:33.25,lng:44.25,location_accuracy:12,location_captured_at:new Date().toISOString(),reason:'Synthetic correction'};
const locationResult=await usdRpc('correct_solo_client_location',correctionId,correctionPayload);
assert.deepEqual(await usdRpc('correct_solo_client_location',correctionId,correctionPayload),locationResult);
const locationAfter=(await usdDb.query('select * from outlets where id=$1',[outlet])).rows[0];
assert.equal(locationAfter.lat,33.25);assert.equal(locationAfter.location_accuracy,12);
await assert.rejects(usdRpc('correct_solo_client_location',id(),{...correctionPayload,expected_updated_at:locationAfter.updated_at.toISOString(),lat:91}),/Valid captured coordinates/);
await usdDb.query("select open_solo_visit($1,$2,'order')",[id(),outlet]);
assert.equal((await usdDb.query('select lat from outlets where id=$1',[outlet])).rows[0].lat,33.25);
await usdDb.exec("select set_config('request.jwt.claim.sub','" + other + "',false);");
await assert.rejects(usdRpc('correct_solo_client_location',id(),correctionPayload),/Owner access/);
console.log('PASS · capture-once metadata · explicit correction/replay · direct-write denial · no new visit coordinates · owner isolation.');
await usdDb.exec('reset role');
await usdDb.exec(await readFile(root + '012_client_and_observation_operations.sql','utf8'));
await usdDb.exec("set role authenticated; select set_config('request.jwt.claim.sub','" + owner + "',false);");
const beforeClient=(await usdDb.query('select * from outlets where id=$1',[outlet])).rows[0];
const clientEdit=id();
const editPayload={outlet_id:outlet,expected_updated_at:beforeClient.updated_at.toISOString(),fields:{retail_name:'Updated synthetic client'}};
await usdRpc('update_solo_client',clientEdit,editPayload);
await usdRpc('update_solo_client',clientEdit,editPayload);
await assert.rejects(usdRpc('update_solo_client',id(),{...editPayload,fields:{assigned_rep:other}}),/changed|Unsupported/);
assert.equal((await usdDb.query('select retail_name from outlets where id=$1',[outlet])).rows[0].retail_name,'Updated synthetic client');
await usdRpc('import_solo_data',id(),{kind:'brands',rows:[{name:'Observation competitor',is_own:false}]});
const cb=(await usdDb.query("select id from survey_brands where name='Observation competitor'")).rows[0].id;
await usdRpc('import_solo_data',id(),{currency:'USD',kind:'products',rows:[{sku:'OBS-COMP',brand_id:cb,product_line:'Competitor line',flavour:'Mint',wholesale_price:null}]});
const cp=(await usdDb.query("select id from products where sku='OBS-COMP'")).rows[0].id;
const observation=id(),observationPayload={currency:'USD',outlet_id:outlet,visit_id:nextVisit,kind:'competitor_price',brand_id:cb,product_id:cp,price:'9.50',facings:0};
await usdRpc('submit_solo_observation',observation,observationPayload);
await usdRpc('submit_solo_observation',observation,observationPayload);
assert.equal((await usdDb.query('select count(*)::int as n from market_observations where id=$1',[observation])).rows[0].n,1);
await assert.rejects(usdRpc('submit_solo_observation',id(),{...observationPayload,brand_id:usdBrand,product_id:sku}),/competitor/);
await assert.rejects(usdRpc('submit_solo_observation',id(),{...observationPayload,price:'9.501'}),/two decimals/);
const editedClient=(await usdDb.query('select * from outlets where id=$1',[outlet])).rows[0];
assert.equal(editedClient.lat,33.25);
await assert.rejects(usdRpc('update_solo_client',id(),{...editPayload,expected_updated_at:editedClient.updated_at.toISOString(),fields:{lat:34}}),/Unsupported/);
await assert.rejects(usdRpc('update_solo_client',id(),editPayload),/changed/);
await assert.rejects(usdRpc('submit_solo_observation',id(),{...observationPayload,shelf_width_cm:'NaN'}),/Shelf width/);
await usdDb.exec("select set_config('request.jwt.claim.sub','" + other + "',false);");
await assert.rejects(usdRpc('update_solo_client',id(),editPayload),/Owner access/);
await assert.rejects(usdRpc('submit_solo_observation',id(),observationPayload),/Owner access/);
console.log('PASS · client identity-preserving edit and replay · competitor observation precision/targeting/replay.');
await usdDb.exec('reset role');
await usdDb.exec(await readFile(root+'013_owner_service_areas.sql','utf8'));
await usdDb.exec("set role authenticated;select set_config('request.jwt.claim.sub','"+owner+"',false)");
assert.equal((await usdDb.query('select count(*)::int as n from service_areas')).rows[0].n,3);
const areaOp=id(),areaRequest={id:'mosul',active:false,expected_version:1};
const changedArea=await usdRpc('set_solo_service_area',areaOp,areaRequest);
assert.equal(changedArea.version,2);assert.equal(changedArea.province,'Nineveh');
assert.deepEqual(await usdRpc('set_solo_service_area',areaOp,areaRequest),changedArea);
await assert.rejects(usdRpc('set_solo_service_area',areaOp,{...areaRequest,active:true}),/different payload/);
await assert.rejects(usdRpc('set_solo_service_area',id(),{...areaRequest,active:true}),/changed/);
await assert.rejects(usdRpc('set_solo_service_area',id(),{id:'mosul',active:true,expected_version:2,province:'Baghdad'}),/required/);
await assert.rejects(usdDb.exec("update service_areas set active=true where id='mosul'"),/permission denied/);
assert.equal((await usdDb.query('select province from outlets where id=$1',[outlet])).rows[0].province,editedClient.province);
await usdDb.exec("select set_config('request.jwt.claim.sub','"+other+"',false)");
assert.equal((await usdDb.query('select count(*)::int as n from service_areas')).rows[0].n,0);
await assert.rejects(usdRpc('set_solo_service_area',id(),areaRequest),/Owner access/);
await usdDb.exec('reset role;set role anon');
await assert.rejects(usdDb.query('select * from service_areas'),/permission denied/);
console.log('PASS · service-area owner-only read/write · immutable province mapping · stale-version denial · exact retry · existing clients preserved.');

await usdDb.exec('reset role');
await usdDb.exec(await readFile(root+'014_stable_visit_start.sql','utf8'));
await usdDb.exec("set role authenticated;select set_config('request.jwt.claim.sub','"+owner+"',false)");
for(const row of (await usdDb.query('select id from visits where outlet_id=$1 and checked_out_at is null',[outlet])).rows) await usdRpc('finish_solo_visit',id(),{visit_id:row.id});
const stableStart=id(),stableVisit=(await usdDb.query("select open_solo_visit($1,$2,'order') as id",[stableStart,outlet])).rows[0].id;
const reuseStart=id(),reuseVisit=(await usdDb.query("select open_solo_visit_v2($1,$2,'survey') as id",[reuseStart,outlet])).rows[0].id;
assert.equal(reuseVisit,stableVisit);
await usdRpc('finish_solo_visit',id(),{visit_id:stableVisit});
const freshVisit=(await usdDb.query("select open_solo_visit($1,$2,'survey') as id",[id(),outlet])).rows[0].id;
const beforeReplay=(await usdDb.query('select count(*)::int as n from visits')).rows[0].n;
assert.equal((await usdDb.query("select open_solo_visit($1,$2,'survey') as id",[reuseStart,outlet])).rows[0].id,stableVisit);
assert.notEqual(freshVisit,stableVisit);
assert.equal((await usdDb.query('select count(*)::int as n from visits')).rows[0].n,beforeReplay);
await assert.rejects(usdDb.query("select open_solo_visit_v2($1,$2,'order')",[reuseStart,outlet]),/different payload/);
await assert.rejects(usdDb.query("select open_solo_visit_v2($1,$2,'survey')",[opened,outlet]),/ended/);
await assert.rejects(usdDb.query("select start_solo_visit($1,$2,'survey')",[stableVisit,outlet]),/Cannot start/);
await usdDb.exec("select set_config('request.jwt.claim.sub','"+other+"',false)");
await assert.rejects(usdDb.query("select open_solo_visit($1,$2,'survey')",[reuseStart,outlet]),/Owner access/);
await usdDb.exec('reset role;set role anon');
await assert.rejects(usdDb.query("select open_solo_visit($1,$2,'survey')",[id(),outlet]),/permission denied/);
await assert.rejects(usdDb.query("select open_solo_visit_v2($1,$2,'survey')",[id(),outlet]),/permission denied/);
console.log('PASS · stable reused-visit replay after close/new stop · no extra visit · payload mismatch · closed/owner/anon denial.');
// Additive price/unit cutover: prepare explicit synthetic per-item source prices.
await usdDb.exec('reset role');
await usdDb.exec('update products set retail_price=wholesale_price where is_own_brand and active');
await usdDb.query('update products set retail_price=10 where id=$1',[sku]);
const historyBefore=JSON.stringify((await usdDb.query('select * from order_lines order by id')).rows);
await usdDb.exec(await readFile(root+'015_fmcg_catalog_contract.sql','utf8'));
assert.equal(JSON.stringify((await usdDb.query('select * from order_lines order by id')).rows),historyBefore);
await usdDb.exec("set role authenticated;select set_config('request.jwt.claim.sub','"+owner+"',false)");
assert.deepEqual(await usdRpc('issue_solo_invoice',usdInvoice,usdRequest),await usdRpc('issue_solo_invoice',usdInvoice,usdRequest));
await assert.rejects(usdRpc('issue_solo_invoice',id(),usdRequest),/Legacy/);
const newRequest={...usdRequest,contract_version:2,items:[{sku_id:sku,quantity:0.5,price:'10.00',uom:'pack',items_per_half_pack:5,packs_per_box:10}]};
const newOp=id();const newInvoice=await usdRpc('issue_solo_invoice_v2',newOp,newRequest);
assert.deepEqual(await usdRpc('issue_solo_invoice_v2',newOp,newRequest),newInvoice);
const newLine=(await usdDb.query('select * from order_lines where order_id=$1',[newOp])).rows[0];
assert.equal(Number(newLine.quantity),1);assert.equal(Number(newLine.unit_price),50);assert.equal(Number(newLine.line_total),50);assert.equal(Number(newLine.unit_cost),30);
assert.equal(newLine.product_snapshot.base_uom,'half_pack');assert.equal(newLine.product_snapshot.selected_quantity,0.5);
await assert.rejects(usdRpc('issue_solo_invoice_v2',id(),{...newRequest,items:[{...newRequest.items[0],quantity:0.25}]}),/quantity changed/);
await assert.rejects(usdRpc('issue_solo_invoice_v2',id(),{...newRequest,items:[{...newRequest.items[0],items_per_half_pack:6}]}),/quantity changed/);
await assert.rejects(usdRpc('issue_solo_invoice_v2',id(),{...newRequest,items:[{...newRequest.items[0],price:9}]}),/quantity changed/);
await assert.rejects(usdRpc('issue_solo_invoice_v2',newOp,{...newRequest,items:[{...newRequest.items[0],quantity:1}]}),/different payload/);
const prod=(await usdDb.query('select * from products where id=$1',[sku])).rows[0];
await usdRpc('update_solo_product_v2',id(),{...prod,currency:'USD',selling_price:'12.00',cost_price:'7.00',items_per_half_pack:6,product_line:'Exceptional line',wholesale_price:undefined,retail_price:undefined});
const exceptionRequest={...newRequest,items:[{...newRequest.items[0],price:12,items_per_half_pack:6,quantity:10}]};
const box=id();await usdRpc('issue_solo_invoice_v2',box,exceptionRequest);
assert.equal(Number((await usdDb.query('select line_total from order_lines where order_id=$1',[box])).rows[0].line_total),1440);
assert.equal(Number((await usdDb.query('select line_total from order_lines where order_id=$1',[newOp])).rows[0].line_total),50);
assert.equal((await usdDb.query('select count(*)::int as n from products p join product_lines l on l.id=p.product_line_id and l.brand_id=p.brand_id')).rows[0].n,(await usdDb.query('select count(*)::int as n from products')).rows[0].n);
await assert.rejects(usdRpc('import_solo_data_v2',id(),{currency:'USD',kind:'products',rows:[{sku:'BAD-LEGACY',brand_id:usdBrand,product_line:'Bad',flavour:'Bad',retail_price:1,active:false}]}),/legacy price keys/);
await usdRpc('import_solo_data_v2',id(),{currency:'USD',kind:'products',rows:[{sku:'UNPRICED-V2',brand_id:usdBrand,product_line:'Inactive',flavour:'Unpriced',active:false,selling_price:null}]});
assert.equal((await usdDb.query("select count(*)::int as n from solo_order_catalog_v2 where sku='UNPRICED-V2'")).rows[0].n,0);
await assert.rejects(usdRpc('issue_solo_invoice_v2',id(),{...newRequest,items:[{...newRequest.items[0],sku_id:cp}]}),/no rows|price or quantity|Competitor/);
await usdDb.exec("select set_config('request.jwt.claim.sub','"+other+"',false)");
assert.equal((await usdDb.query('select count(*)::int as n from product_lines')).rows[0].n,0);
await assert.rejects(usdRpc('issue_solo_invoice_v2',id(),newRequest),/Owner access/);
await usdDb.exec('reset role;set role anon');
await assert.rejects(usdRpc('issue_solo_invoice_v2',id(),newRequest),/permission denied/);
console.log('PASS · FMCG per-item selling price · integral half-pack posting · SKU exceptions/Box · immutable history · versioned retry · legacy denial · line/brand registry · owner isolation.');
// Cash defaults never post a receipt by implication; enforce new credit limits server-side.
await usdDb.exec('reset role');
await usdDb.exec("set role authenticated;select set_config('request.jwt.claim.sub','"+owner+"',false)");
const oldTermsOp=id(),oldTermsRequest={...exceptionRequest,terms_days:14};
const oldTermsResult=await usdRpc('issue_solo_invoice_v2',oldTermsOp,oldTermsRequest);
await usdDb.exec('reset role');
const beforeTermsHistory=JSON.stringify((await usdDb.query('select * from order_lines order by id')).rows);
await usdDb.exec(await readFile(root+'016_cash_credit_terms.sql','utf8'));
assert.equal(JSON.stringify((await usdDb.query('select * from order_lines order by id')).rows),beforeTermsHistory);
await usdDb.exec("set role authenticated;select set_config('request.jwt.claim.sub','"+owner+"',false)");
assert.deepEqual(await usdRpc('issue_solo_invoice_v2',oldTermsOp,oldTermsRequest),oldTermsResult);
for(const days of [1,3,4.5,11,14,60])await assert.rejects(usdRpc('issue_solo_invoice_v2',id(),{...exceptionRequest,terms_days:days}),/4 to 10/);
for(const days of [0,4,10]){
 const op=id();await usdRpc('issue_solo_invoice_v2',op,{...exceptionRequest,terms_days:days,initial_amount:'0.0'});
 const row=(await usdDb.query('select * from solo_invoice_balances where id=$1',[op])).rows[0];assert.equal(Number(row.collected),0);assert.equal(row.payment_status,'Unpaid');
 assert.equal((await usdDb.query('select count(*)::int as n from payments where order_id=$1',[op])).rows[0].n,0);
 const stored=(await usdDb.query("select payment_type,due_date-((now() at time zone 'Asia/Baghdad')::date) as days from orders where id=$1",[op])).rows[0];assert.equal(stored.days,days);assert.equal(stored.payment_type,days===0?'cash':'credit');
}
await assert.rejects(usdDb.query('select wsd_private.issue_solo_invoice_v2($1,$2)',[id(),JSON.stringify(exceptionRequest)]),/permission denied/);
console.log('PASS · Cash due today without implicit receipt · credit4–10 only · historical14-day replay · protected underlying posting function.');
await usdDb.close()
