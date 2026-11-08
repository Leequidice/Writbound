import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const RPC='https://rpc.testnet.near.org';
const EXPECTED='b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019';
const wasm='contracts/writbound-escrow/target/near/writbound_escrow.wasm';
function base58(buffer){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+buffer.toString('hex'));let result='';while(n>0n){result=alphabet[Number(n%58n)]+result;n/=58n;}for(const b of buffer){if(b!==0)break;result='1'+result;}return result;}
const bytes=readFileSync(wasm);
const actual=createHash('sha256').update(bytes).digest('hex');
if(actual!==EXPECTED || !WebAssembly.validate(bytes)) throw new Error('Approved WASM hash/validation mismatch');
async function rpc(method,params){
 const response=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:method,method,params}),signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error(`RPC HTTP ${response.status}`);
 const body=await response.json();if(body.error){const error=new Error(JSON.stringify(body.error));error.rpc=body.error;throw error;}return body.result;
}
const status=await rpc('status',[]);
if(status.chain_id!=='testnet')throw new Error('RPC is not testnet');
const block=await rpc('block',{finality:'final'});
const [protocol,gas]=await Promise.all([rpc('EXPERIMENTAL_protocol_config',{block_id:block.header.hash}),rpc('gas_price',[block.header.hash])]);
const cost=BigInt(protocol.runtime_config.storage_amount_per_byte);
const price=BigInt(gas.gas_price);
const reserve=cost*16384n;
const escrow=10n**22n;
const near=n=>`${n/10n**24n}.${(n%10n**24n).toString().padStart(24,'0')}`;
const roles=['contract','verifier','customer','worker','challenger'];
const proposed=process.argv.includes('--proposed');
const replacements=process.argv.includes('--replacements');
if(proposed&&replacements)throw new Error('Choose one account mapping');
const accountFile=replacements?'docs/testnet-accounts.replacement-proposal.json':proposed?'docs/testnet-accounts.proposed.json':'docs/testnet-accounts.json';
const accounts=existsSync(accountFile)?JSON.parse(readFileSync(accountFile,'utf8')):{};
for(const key of Object.keys(accounts))if(!roles.includes(key))throw new Error('Unexpected account configuration field');
const selected=roles.map(role=>accounts[role]).filter(Boolean);
if(selected.some(id=>typeof id!=='string'||!(/^[a-f0-9]{64}$/.test(id)||/^([a-z0-9]+[-_])*[a-z0-9]+(\.([a-z0-9]+[-_])*[a-z0-9]+)*\.testnet$/.test(id))||id.length>64)||new Set(selected).size!==selected.length)throw new Error('Accounts must be distinct public named .testnet or implicit IDs');
const balances={};
for(const role of roles){
 const account_id=accounts[role];
 if(!account_id){balances[role]={account_id:null,status:'awaiting public account selection'};continue;}
 try{
  const account=await rpc('query',{request_type:'view_account',account_id,block_id:block.header.hash});
  const keys=await rpc('query',{request_type:'view_access_key_list',account_id,block_id:block.header.hash});
  const storage=cost*BigInt(account.storage_usage);
  const amount=BigInt(account.amount);
  balances[role]={account_id,amount_yocto:account.amount,amount_near:near(amount),locked_yocto:account.locked,storage_bytes:account.storage_usage,conservative_storage_reserve_near:near(storage),conservative_liquid_near:near(amount>storage?amount-storage:0n),code_hash:account.code_hash,full_access_key_count:keys.keys.filter(k=>k.access_key.permission==='FullAccess').length,full_access_public_keys:keys.keys.filter(k=>k.access_key.permission==='FullAccess').map(k=>k.public_key),local_signing_available:'not checked; no credential contents read'};
 }catch(error){balances[role]={account_id,status:error.rpc?.cause?.name==='UNKNOWN_ACCOUNT'?'not created (UNKNOWN_ACCOUNT)':'read-only account lookup failed',balance_near:null,error:String(error)};}
}
const report={checked_at_utc:new Date().toISOString(),rpc:RPC,chain_id:status.chain_id,block_hash:block.header.hash,block_height:block.header.height,block_timestamp_ns:block.header.timestamp_nanosec??String(block.header.timestamp),protocol_version:protocol.protocol_version,artifact:{path:wasm,bytes:bytes.length,sha256:actual,code_hash_base58:base58(Buffer.from(actual,'hex'))},storage_amount_per_byte_yocto:cost.toString(),job_storage_reserve_near:near(reserve),escrow_per_job_near:near(escrow),exact_deposit_per_job_near:near(reserve+escrow),two_job_customer_deposit_near:near(2n*(reserve+escrow)),wasm_code_storage_only_estimate_near:near(cost*BigInt(bytes.length)),gas_price_yocto_per_gas:price.toString(),illustrative_150_tgas_prepaid_cost_near:near(price*150n*10n**12n),planned_2250_tgas_function_prepaid_budget_near:near(price*2250n*10n**12n),conservative_19_transaction_300_tgas_function_gas_budget_near:near(price*19n*300n*10n**12n),fee_note:'Function gas budget at snapshot price only; action/deploy fees and future prices vary. No transaction was signed or broadcast.',accounts:balances,agent_transactions_executed:0,initialization_account_compatible:Boolean(accounts.contract?.endsWith('.testnet')),account_selection:proposed?'suggested names only; not selected or owned':'public IDs supplied by product owner; contract initialization compatibility must pass',approval:'not granted for execution'};
writeFileSync(replacements?'docs/final-testnet-preflight.json':proposed?'docs/testnet-preflight.proposed.json':'docs/testnet-preflight.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
