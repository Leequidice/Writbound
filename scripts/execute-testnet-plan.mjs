import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
if (process.argv[2] === 'step') {
  console.error('Broadcasting is disabled for the Writbound release freeze.');
  process.exit(1);
}
const DIR='docs/testnet-execution';mkdirSync(DIR,{recursive:true});
const STATE=`${DIR}/state.json`;
const PLAN_PATH='docs/testnet-transaction-plan.final-approval.json';
const PLAN_HASH='33266af8dab092cce7c4e5eea92d96cc539dd552dd8116a81895107902f11345';
const EXPECTED='b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019';
const RPC='https://archival-rpc.testnet.fastnear.com/';const CLI_RPC=RPC;
const CLI=resolve('.tools/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe');
const WASM=resolve('contracts/writbound-escrow/target/near/writbound_escrow.wasm');
const digest=data=>createHash('sha256').update(data).digest('hex');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,v)=>writeFileSync(p,JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x,2)+'\n');
const assert=(x,m)=>{if(!x)throw new Error(m);};
assert(digest(readFileSync(PLAN_PATH))===PLAN_HASH,'Approved plan changed');
const plan=read(PLAN_PATH);const accounts=plan.account_ids;
let state=existsSync(STATE)?read(STATE):null;
let readQueue=Promise.resolve(),lastRead=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function rpc(method,params,url=RPC){
 assert(['status','block','query','EXPERIMENTAL_protocol_config','gas_price','EXPERIMENTAL_tx_status'].includes(method),'Only verification reads may retry');
 const operation=readQueue.then(async()=>{for(let attempt=0;attempt<4;attempt++){
  await sleep(Math.max(0,2000-(Date.now()-lastRead)));lastRead=Date.now();
  try{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:`execution-${method}`,method,params}),signal:AbortSignal.timeout(30000)});
   assert(![401,402,403].includes(response.status),`RPC access/payment restriction HTTP ${response.status}`);
   const body=await response.json();if(!response.ok||body.error){const e=new Error(`RPC ${method}: HTTP ${response.status} ${JSON.stringify(body.error??{})}`);e.rpc=body.error;e.retryable=response.status===429||response.status>=500||body.error?.code===-429;throw e;}return body.result;
  }catch(e){if(attempt===3||!(e.retryable||['TimeoutError','TypeError'].includes(e.name)))throw e;await sleep(4000*2**attempt);}
 }});readQueue=operation.catch(()=>{});return operation;
}
async function account(id,block){try{return await rpc('query',{request_type:'view_account',account_id:id,block_id:block});}catch(e){if(e.rpc?.cause?.name==='UNKNOWN_ACCOUNT')return null;throw e;}}
async function keys(id,block){return (await rpc('query',{request_type:'view_access_key_list',account_id:id,block_id:block})).keys;}
async function view(method,args={},block='final'){const p={request_type:'call_function',account_id:accounts.contract,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')};if(block==='final')p.finality='final';else p.block_id=block;const r=await rpc('query',p);return JSON.parse(Buffer.from(r.result).toString());}
async function snapshot(){const block=await rpc('block',{finality:'final'});const values={};for(const [role,id] of Object.entries(accounts))values[role]=await account(id,block.header.hash);return {block_height:block.header.height,block_hash:block.header.hash,timestamp_ns:String(block.header.timestamp_nanosec??block.header.timestamp),accounts:values};}
function checkLocal(){assert(digest(readFileSync(WASM))===EXPECTED,'WASM hash changed');assert(digest(readFileSync(PLAN_PATH))===PLAN_HASH,'Plan hash changed');const proof=read('docs/final-testnet-signing-readiness.json');assert(proof.all_five_verified,'All-five signing gate failed');for(const [role,id] of Object.entries(accounts))assert(proof.results[role]?.verified&&proof.results[role].account_id===id,`Signing identity mismatch: ${role}`);const config=read('docs/execution-cli-config.json');assert(config.network_name==='testnet'&&config.rpc_url===CLI_RPC,'CLI configuration is not the approved testnet endpoint');assert(digest(readFileSync(config.config_path))===config.config_sha256,'CLI configuration changed');return proof;}
async function gates(step){
 const proof=checkLocal();
 const [network,cliNetwork,block]=await Promise.all([rpc('status',[]),rpc('status',[],CLI_RPC),rpc('block',{finality:'final'})]);
 assert(network.chain_id==='testnet'&&cliNetwork.chain_id==='testnet','Network verification failed');
 const protocol=await rpc('EXPERIMENTAL_protocol_config',{block_id:block.header.hash});
 const gas=await rpc('gas_price',[block.header.hash]);const price=BigInt(gas.gas_price),cost=BigInt(protocol.runtime_config.storage_amount_per_byte);
 assert(protocol.protocol_version>=88,'Protocol incompatible with approved artifact');
 // Approved conservative fee envelope, scaled to current gas price; no amount/gas increases.
 const currentEnvelope=5832583134272267n*price+28000000000000000000000n;
 assert(BigInt(state?.fee_spent_yocto??0)+currentEnvelope<=10n**24n,'Fee budget cap would be exceeded');
 const c=await account(accounts.contract,block.header.hash);assert(c&&c.locked==='0','Contract unavailable or unexpected staking lock');
 assert(BigInt(c.storage_usage)*cost<=2n*10n**24n,'Contract storage allowance exceeded');
 assert(BigInt(c.amount)>BigInt(c.storage_usage)*cost+10n**22n,'Insufficient liquid source balance');
 const signer=step?.signer_account_id??accounts.contract;
 const signerAccount=await account(signer,block.header.hash);assert(signerAccount,'Signer account is inactive');
 const allowed=await keys(signer,block.header.hash);const pub=proof.results[step?.signer_role??'contract'].public_key;
 assert(allowed.some(k=>k.public_key===pub&&k.access_key.permission==='FullAccess'),'Signing key/permission check failed');
 if(step?.action==='native NEAR Transfer'){assert(await account(step.recipient,block.header.hash)===null,'Activation recipient already active; plan needs review');assert(BigInt(signerAccount.amount)>=BigInt(step.amount_NEAR)*10n**24n+cost*BigInt(signerAccount.storage_usage)+10n**23n,'Activation source liquidity insufficient');}
 else if(step?.method==='DeployContract + new'){assert(c.code_hash==='11111111111111111111111111111111','Contract already has code');assert(BigInt(c.amount)>=2n*10n**24n+10n**23n,'Deployment storage/gas liquidity insufficient');}
 else if(step){assert(c.code_hash===plan.expected_code_hash_base58,'Deployed code changed');assert(await view('get_verifier',{},block.header.hash)===accounts.verifier,'Immutable verifier changed');}
 return {block,price,cost,proof,signerAccount};
}
function boundReport(filename,value){const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');writeFileSync(`${DIR}/${filename}`,bytes);return digest(bytes);}
async function resolveArgs(tx,gate){
 if(tx.action)return null;let args=structuredClone(tx.args);
 const H=state.H,B=state.B;
 if(args.job_id==='<H>'){assert(H!==undefined,'H job missing');args.job_id=H;}
 if(args.job_id==='<B>'){assert(B!==undefined,'B job missing');args.job_id=B;}
 if(tx.method==='create_job'){args.work_deadline=(BigInt(gate.block.header.timestamp_nanosec??gate.block.header.timestamp)+7200n*10n**9n).toString();}
 if(tx.step===9||tx.step===14){const good=tx.step===9;const fixture=read(`docs/demo/${good?'happy':'defective'}-checks.json`);assert(fixture.passed===good,'Fixture check result changed');args.evidence_hash=boundReport(`${good?'happy':'seeded-false-positive'}-job-report.json`,{...fixture,contract_account_id:accounts.contract,job_id:args.job_id,attestation_mode:good?'genuine_full_checks_pass':'seeded_false_positive_demonstration_only',onchain_attestation_passed:true,full_checks_passed:fixture.passed,explanation:good?'All published checks pass':'Controlled fault injection: full checks fail; not a genuine independent discovery or successful full verification'});}
 if(tx.step===15){const fixture=read('docs/demo/defective-checks.json');args.evidence_hash=boundReport('challenge-evidence.json',{...fixture,contract_account_id:accounts.contract,job_id:B,missing_row:['002','Bob'],reproduce:'python scripts/prepare-demo-evidence.py',kind:'reproducible_counterexample_to_seeded_false_positive'});}
 if(tx.step===20){args.challenge_id=state.challenge_id;args.resolution_hash=boundReport('challenge-resolution.json',{contract_account_id:accounts.contract,job_id:B,challenge_id:state.challenge_id,upheld:true,allow_correction:false,fixture_is_seeded:true,reason:'Distinct input row 002,Bob is missing; full deterministic checks fail',evidence_hash:state.challenge_evidence_hash,defective_report:read('docs/demo/defective-checks.json')});}
 return args;
}
async function waitGuard(tx,gate){const now=BigInt(gate.block.header.timestamp_nanosec??gate.block.header.timestamp);
 if(tx.step===10){const j=await view('get_job',{job_id:state.H});assert(now<BigInt(j.submissions.at(-1).challenge_end),'Early-rejection window already elapsed');}
 if(tx.step>=16){const h=await view('get_job',{job_id:state.H});const b=await view('get_job',{job_id:state.B});const end=[h,b].map(j=>BigInt(j.submissions.at(-1).challenge_end)).reduce((a,b)=>a>b?a:b);if(now<end){const e=new Error('Real challenge window remains open');e.waitUntil=end.toString();throw e;}if(tx.step<=20)assert(now<BigInt(b.challenges[state.challenge_id].resolution_deadline),'Challenge resolution deadline elapsed');}
}
function command(tx,args,deposit,pub){let a=[];if(tx.action)a=['transaction','construct-transaction',accounts.contract,'receiver-id',tx.recipient,'add-action','transfer',`${tx.amount_NEAR} NEAR`,'skip'];else if(tx.method==='DeployContract + new')a=['contract','deploy',accounts.contract,'use-file',WASM,'with-init-call','new','json-args',JSON.stringify(args),'prepaid-gas',`${tx.prepaid_Tgas} Tgas`,'attached-deposit','0 NEAR'];else a=['contract','call-function','as-transaction',accounts.contract,tx.method,'json-args',JSON.stringify(args),'prepaid-gas',`${tx.prepaid_Tgas} Tgas`,'attached-deposit',`${deposit} yoctonear`,'sign-as',tx.signer_account_id];return [...a,'network-config','testnet','sign-with-keychain','--signer-public-key',pub,'send'];}
async function invoke(args){return await new Promise((resolve,reject)=>{const p=spawn(CLI,args,{shell:false,stdio:['ignore','pipe','pipe'],windowsHide:true});let text='';const collect=d=>{text+=d.toString();if(text.length>5_000_000){p.kill();reject(new Error('Unexpected CLI output size'));}};p.stdout.on('data',collect);p.stderr.on('data',collect);p.on('error',()=>reject(new Error('CLI process failed to start')));p.on('close',code=>resolve({code,text:text.replace(/\x1b\[[0-9;]*m/g,'')}));});}
async function finalOutcome(hash,signer){let last;for(let i=0;i<4;i++){try{const r=await rpc('EXPERIMENTAL_tx_status',{tx_hash:hash,sender_account_id:signer,wait_until:'FINAL'});if(r.final_execution_status==='FINAL')return r;last=new Error('Final execution not yet complete');}catch(e){last=e;}await new Promise(r=>setTimeout(r,2000));}throw last;}
function verifySubmitted(result,tx,args,deposit){const t=result.transaction;assert(t.signer_id===tx.signer_account_id,'Actual signer differs');assert(t.receiver_id===(tx.recipient??accounts.contract),'Actual receiver differs');if(tx.action){assert(t.actions.length===1&&t.actions[0].Transfer?.deposit===(10n**24n).toString(),'Actual activation amount/action differs');}else{const functions=t.actions.filter(a=>a.FunctionCall).map(a=>a.FunctionCall);assert(functions.length===1,'Unexpected function action count');const f=functions[0];assert(f.method_name===(tx.method==='DeployContract + new'?'new':tx.method),'Actual method differs');assert(String(f.gas)===(BigInt(tx.prepaid_Tgas)*10n**12n).toString()&&f.deposit===deposit,'Actual gas/deposit differs');assert(isDeepStrictEqual(JSON.parse(Buffer.from(f.args,'base64').toString()),args),'Actual function args differ');assert(t.actions.length===(tx.step===5?2:1),'Unexpected actions');}}
async function verifyState(tx,result,after){
 if(tx.action){const role=Object.keys(accounts).find(r=>accounts[r]===tx.recipient);const a=after.accounts[role];assert(a&&BigInt(a.amount)===10n**24n,'Activation credit differs');const k=await keys(tx.recipient,after.block_hash);assert(k.length===1&&k[0].public_key===read('docs/final-testnet-signing-readiness.json').results[role].public_key&&k[0].access_key.permission==='FullAccess','Activated key differs');return;}
 if(tx.step===5){assert(after.accounts.contract.code_hash===plan.expected_code_hash_base58,'Deployed code hash differs');const code=await rpc('query',{request_type:'view_code',account_id:accounts.contract,block_id:after.block_hash});assert(digest(Buffer.from(code.code_base64,'base64'))===EXPECTED,'Deployed WASM bytes differ');assert(await view('get_verifier')===accounts.verifier,'Initialized verifier differs');assert(await view('version')==='writbound-escrow-0.2.0','Version differs');assert(await view('get_job_count')==='0','Unexpected preexisting jobs');state.deployed_code_verified=true;return;}
 const succeeded=!result.status.Failure;const decoded=succeeded?JSON.parse(Buffer.from(result.status.SuccessValue??'','base64').toString()||'null'):null;
 if(tx.step===6)state.H=String(decoded);if(tx.step===11)state.B=String(decoded);if(tx.step===15)state.challenge_id=Number(decoded);
 const id=tx.step<=10||[16,17,18].includes(tx.step)?state.H:state.B;
 const job=await view('get_job',{job_id:id});
 const expected={6:'Open',7:'Accepted',8:'Submitted',9:'Verified',10:'Verified',11:'Open',12:'Accepted',13:'Submitted',14:'Verified',15:'Verified',16:'Paid',17:'Paid',18:'Paid',19:'Verified',20:'Refundable',21:'Refunded',22:'Refunded',23:'Refunded'};
 assert(job.state===expected[tx.step],`Unexpected state at step ${tx.step}: ${job.state}`);
 assert(job.customer===accounts.customer&&job.escrow==='10000000000000000000000','Job beneficiary/escrow differs');
 if(tx.step>=7&&tx.step!==11)assert(job.worker===accounts.worker,'Assigned worker differs');
 if([9,14].includes(tx.step)){state[tx.step===9?'H_challenge_end':'B_challenge_end']=job.submissions.at(-1).challenge_end;}
 if(tx.step===15){state.challenge_evidence_hash=job.challenges[state.challenge_id].evidence_hash;state.resolution_deadline=job.challenges[state.challenge_id].resolution_deadline;}
 if([16,21].includes(tx.step)){assert(decoded===true,'Transfer callback did not confirm success');assert(job.transfer_attempt==='1','Unexpected transfer attempt count');assert(job.transfer_completed_at,'Missing transfer completion time');}
 state.jobs??={};state.jobs[id]=job;state.accounting=await view('get_accounting');
 if(tx.step===23){assert(state.accounting.unpaid_escrow==='0'&&state.accounting.pending_transfers==='0'&&state.accounting.total_paid==='10000000000000000000000'&&state.accounting.total_refunded==='10000000000000000000000'&&state.accounting.storage_reserves==='327680000000000000000000','Final financial accounting differs');}
}
async function main(){
 const mode=process.argv[2];
 if(mode==='reconcile-json-order'){
  assert(state?.transactions.length===6&&state.stop_reason==='Actual function args differ','Reconciliation limited to recorded step 6 comparison incident');checkLocal();
  const network=await rpc('status',[]);assert(network.chain_id==='testnet','Network mismatch');const row=state.transactions[5],tx=plan.transactions[5];assert(row.hash&&!row.verified,'Only existing unverified hash may reconcile');
  const result=await finalOutcome(row.hash,tx.signer_account_id);verifySubmitted(result,tx,row.args,row.deposit_yocto);assert(!result.status.Failure&&[result.transaction_outcome,...result.receipts_outcome].every(o=>!o.outcome.status.Failure),'Unexpected onchain failure');
  const after=await snapshot();await verifyState(tx,result,after);const fee=[result.transaction_outcome,...result.receipts_outcome].reduce((v,o)=>v+BigInt(o.outcome.tokens_burnt),0n);row.fee_yocto=fee.toString();state.fee_spent_yocto=(BigInt(state.fee_spent_yocto)+fee).toString();row.verified=true;row.outcome='success';row.final_execution_status='FINAL';row.completed_at=new Date().toISOString();state.latest_balances=after;state.status='stopped_after_verification_tooling_incident';
  state.local_tooling_incidents??=[];state.local_tooling_incidents.push({step:6,reason:'Official CLI reordered JSON object keys; original order-sensitive comparison rejected semantically identical approved arguments',reconciled:true,no_parameter_changes:true,no_resubmission:true});write(`${DIR}/step-06-after.json`,after);write(STATE,state);console.log(JSON.stringify({step:6,hash:row.hash,outcome:row.outcome,verified:true,H:state.H,snapshot:after,status:state.status},null,2));return;
 }
 if(mode==='resume-precheck'){
  assert(state?.transactions.length===1&&state.transactions[0].verified&&state.transactions[0].hash==='BaQ9x4MaQdatz4cv9KajgYLPrTtqbAQmUmMXBPkEj71H','Resume must preserve finalized step 1');
  const g=await gates();const result=await finalOutcome(state.transactions[0].hash,accounts.contract);verifySubmitted(result,plan.transactions[0],null,'0');assert(!result.status.Failure,'Transaction 1 not successful');
  const fresh=await snapshot();for(const role of ['contract','verifier']){assert(fresh.accounts[role],'Previously active account missing');const k=await keys(accounts[role],fresh.block_hash);assert(k.some(x=>x.public_key===g.proof.results[role].public_key&&x.access_key.permission==='FullAccess'),'Active signing key mismatch');}
  for(const role of ['customer','worker','challenger'])assert(fresh.accounts[role]===null,'Unexpected preexisting activation');
  assert(fresh.accounts.contract.amount===state.latest_balances.accounts.contract.amount&&fresh.accounts.verifier.amount==='1000000000000000000000000','Balance changed since reconciliation');
  state.resume_authorization={at:new Date().toISOString(),scope:'Owner controlled resumption steps 2–23, original 7 testnet NEAR cap including step 1',endpoint:RPC,read_policy:'serialized minimum 2 seconds; four attempts with 4/8/16 second bounded exponential backoff; no broadcast retries'};
  state.status='authorized_ready';state.latest_balances=fresh;delete state.stop_reason;write(`${DIR}/resume-precheck.json`,{network:'testnet',artifact_sha256:EXPECTED,plan_sha256:PLAN_HASH,step_1_final:true,free_unauthenticated_queries:true,fee_spent_yocto:state.fee_spent_yocto,snapshot:fresh});write(STATE,state);console.log('Resume prerequisites passed; no new transactions submitted');return;
 }
 if(mode==='init'){
  assert(!state,'Execution journal already exists; no reinitialization');const g=await gates();const before=await snapshot();assert(before.accounts.contract.amount==='10000000000000000000000000','Initial source balance changed');assert(before.accounts.contract.code_hash==='11111111111111111111111111111111','Initial code already present');assert(Object.entries(before.accounts).every(([r,a])=>r==='contract'||a===null),'Role already activated');
  state={status:'authorized_ready',approved_plan_sha256:PLAN_HASH,authorization:'Product-owner final execution authorization: exact replacement-account 23-step plan, testnet only, maximum 7 NEAR resource allocation',started_at:new Date().toISOString(),transactions:[],fee_spent_yocto:'0',baseline:before,initial_gas_price:g.price.toString(),initial_storage_byte_cost:g.cost.toString()};write(STATE,state);write(`${DIR}/baseline.json`,before);console.log(JSON.stringify({status:state.status,signing:'all five verified',network:'testnet',balance:'10 NEAR',artifact:EXPECTED,transactions_submitted:0}));return;
 }
 assert(state,'Initialize verified execution journal first');assert(state.approved_plan_sha256===PLAN_HASH,'Journal plan differs');if(mode==='recover-verified-first-transfer'){
  assert(state.transactions.length===1&&!state.transactions[0].verified,'Recovery limited to first unverified transfer');
  const found=read(`${DIR}/step-01-hash-recovery.json`);assert(found.matching_hashes.length===1,'Recovery hash must be unique');
  const hash=found.matching_hashes[0];const result=await finalOutcome(hash,accounts.contract);const tx=plan.transactions[0];
  verifySubmitted(result,tx,null,'0');assert(!result.status.Failure&&[result.transaction_outcome,...result.receipts_outcome].every(o=>!o.outcome.status.Failure),'Recovered transaction failed unexpectedly');
  const after=await snapshot();await verifyState(tx,result,after);
  const fee=[result.transaction_outcome,...result.receipts_outcome].reduce((v,o)=>v+BigInt(o.outcome.tokens_burnt),0n);
  const row=state.transactions[0];row.hash=hash;row.explorer=`https://testnet.nearblocks.io/txns/${hash}`;row.outcome='success';row.verified=true;row.fee_yocto=fee.toString();row.final_execution_status=result.final_execution_status;row.completed_at=new Date().toISOString();row.hash_recovered_read_only=true;
  state.fee_spent_yocto=fee.toString();state.status='authorized_ready';state.latest_balances=after;state.local_output_filter_issue='Public Ed25519 signature was incorrectly classified as a secret; no private material exposed; actual successful transaction recovered read-only; no onchain retry';delete state.stop_reason;delete state.stopped_at;
  write(`${DIR}/step-01-rpc.json`,result);write(`${DIR}/step-01-after.json`,after);write(STATE,state);console.log(JSON.stringify({step:1,hash,explorer:row.explorer,outcome:'success',verified:true,no_resubmission:true},null,2));return;
 }
 assert(state.status==='authorized_ready'||mode==='inspect','Execution stopped; fresh authorization required');
 if(mode==='inspect'){console.log(JSON.stringify({journal_status:state.status,verified_transactions:state.transactions.filter(t=>t.verified).length,H:state.H,B:state.B,H_challenge_end:state.H_challenge_end,B_challenge_end:state.B_challenge_end,snapshot:await snapshot()},null,2));return;}
 assert(mode==='step','Use init, step N or inspect');const n=Number(process.argv[3]);assert(n===state.transactions.length+1&&n>=1&&n<=23,'Out-of-order or duplicate transaction blocked');assert(state.transactions.every(t=>t.verified),'Prior transaction not verified');const tx=plan.transactions[n-1];
 const g=await gates(tx);await waitGuard(tx,g);const args=await resolveArgs(tx,g);let deposit='0';if(tx.method==='create_job'){const quote=BigInt(await view('storage_quote'));assert(quote===16384n*g.cost,'Live storage quote inconsistent');deposit=(10n**22n+quote).toString();assert(BigInt(g.signerAccount.amount)>BigInt(deposit)+10n**23n,'Customer insufficient funds');}
 const before=await snapshot();const pub=g.proof.results[tx.signer_role].public_key;const argv=command(tx,args,deposit,pub);
 const row={step:n,signer_role:tx.signer_role,signer:tx.signer_account_id,receiver:tx.receiver_account_id,method:tx.method??tx.action,args,deposit_yocto:tx.action?(10n**24n).toString():deposit,expected_rejection:plan.expected_rejected_transactions.includes(n),started_at:new Date().toISOString(),verified:false};state.transactions.push(row);state.status='broadcast_in_progress';write(STATE,state);write(`${DIR}/step-${String(n).padStart(2,'0')}-before.json`,before);
 const cli=await invoke(argv);row.cli_exit_code=cli.code;
 const longTokens=[...cli.text.matchAll(/ed25519:[1-9A-HJ-NP-Za-km-z]{80,}/g)];
 const onlyPublicSignatures=longTokens.every(m=>/Signature:\s*$/i.test(cli.text.slice(Math.max(0,m.index-100),m.index)));
 assert(onlyPublicSignatures&&!/-----BEGIN .*PRIVATE KEY/.test(cli.text),'Sensitive output suppressed; stop');
 writeFileSync(`${DIR}/step-${String(n).padStart(2,'0')}-cli.log`,cli.text);
 const hashes=[...cli.text.matchAll(/(?:Transaction ID:\s*|\/txns\/)([1-9A-HJ-NP-Za-km-z]{32,44})/gi)].map(m=>m[1]);const unique=[...new Set(hashes)];assert(unique.length===1,'Transaction hash missing/ambiguous; no retry permitted');row.hash=unique[0];row.explorer=`https://testnet.nearblocks.io/txns/${row.hash}`;write(STATE,state);
 const result=await finalOutcome(row.hash,tx.signer_account_id);write(`${DIR}/step-${String(n).padStart(2,'0')}-rpc.json`,result);verifySubmitted(result,tx,args,deposit);
 const failures=[result.transaction_outcome,...result.receipts_outcome].filter(o=>o.outcome.status.Failure);const failureText=JSON.stringify(result.status.Failure??'');
 const reasons={10:'Challenge window is still open',17:'Job is not payable',18:'Job is not refundable',19:'Unresolved challenge',22:'Job is not refundable',23:'Job is not payable'};
 if(row.expected_rejection){assert(result.status.Failure&&failureText.toLowerCase().includes(reasons[n].toLowerCase()),'Expected rejection did not match');row.outcome='expected_rejection';row.failure=result.status.Failure;}else{assert(!result.status.Failure&&failures.length===0,'Unexpected onchain failure');row.outcome='success';}
 const fee=[result.transaction_outcome,...result.receipts_outcome].reduce((v,o)=>v+BigInt(o.outcome.tokens_burnt),0n);state.fee_spent_yocto=(BigInt(state.fee_spent_yocto)+fee).toString();row.fee_yocto=fee.toString();assert(BigInt(state.fee_spent_yocto)<=10n**24n,'Actual fee cap exceeded');
 const after=await snapshot();write(`${DIR}/step-${String(n).padStart(2,'0')}-after.json`,after);await verifyState(tx,result,after);row.verified=true;row.final_execution_status=result.final_execution_status;row.completed_at=new Date().toISOString();state.status=n===23?'completed':'authorized_ready';state.latest_balances=after;write(STATE,state);console.log(JSON.stringify({step:n,hash:row.hash,explorer:row.explorer,outcome:row.outcome,verified:true,fee_yocto:row.fee_yocto,next_step:n<23?n+1:null,H:state.H,B:state.B,H_challenge_end:state.H_challenge_end,B_challenge_end:state.B_challenge_end},null,2));
}
main().catch(error=>{if(error.waitUntil){console.log(JSON.stringify({status:'waiting_for_real_challenge_window',wait_until_ns:error.waitUntil,transactions_submitted:state.transactions.length}));process.exitCode=2;return;}if(state){state.status='stopped_unexpected';state.stop_reason=error.message;state.stopped_at=new Date().toISOString();write(STATE,state);}console.error(`STOP: ${error.message}`);process.exitCode=1;});
