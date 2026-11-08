import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const path='docs/testnet-execution/state.json';
const s=JSON.parse(readFileSync(path));
const near=x=>{const v=BigInt(x);return `${v/10n**24n}.${(v%10n**24n).toString().padStart(24,'0')}`.replace(/\.?0+$/,'');};
const fees=BigInt(s.fee_spent_yocto),a=s.latest_balances;
const total=Object.values(a.accounts).reduce((t,v)=>t+BigInt(v.amount),0n);
const net=10n**25n-total;
const report={status:'STOPPED AFTER 6 OF 23: verification-tooling incident reconciled read-only; no further broadcasts',approved_contract_account:'writbound-escrow-20261105.testnet',deployed_contract_account:'writbound-escrow-20261105.testnet',approved_wasm_sha256:'b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019',deployed_code_hash:a.accounts.contract.code_hash,deployed_code_verified:s.deployed_code_verified,submitted_transactions:s.transactions.length,successful_transactions:6,expected_rejections_executed:0,unexpected_onchain_failures:0,actual_transactions:s.transactions,actual_network_fees_NEAR:near(fees),net_controlled_balance_decrease_NEAR:near(net),contract_gas_reward_difference_NEAR:near(fees-net),resource_allocation_cap_NEAR:'7',conservative_allocation_with_full_storage_allowance_NEAR:near(6n*10n**24n+fees),balances:a,happy_path:'Job 0 Open, funded with 0.01 escrow and 0.16384 storage reserve; no acceptance, submission, attestation or settlement',challenge_refund_path:'Not executed',seeded_false_positive:'Not submitted; demonstration fixture only',accounting:s.accounting,remaining_steps:[7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23],stop_reason:'Order-sensitive JSON comparison failed after transaction 6; semantic equality and full finalized state were subsequently verified read-only. Broadcasts remain stopped under owner verification checkpoint.',no_resubmissions:true};
writeFileSync('docs/testnet-execution-report.json',JSON.stringify(report,null,2)+'\n');
s.next_unexecuted_step=7;s.stop_reason=report.stop_reason;writeFileSync(path,JSON.stringify(s,null,2)+'\n');
const rows=s.transactions.map(t=>`| ${t.step} | [${t.hash}](${t.explorer}) | FINAL success | ${near(t.fee_yocto)} |`).join('\n');
const balances=Object.entries(a.accounts).map(([r,v])=>`| ${r} | ${near(v.amount)} |`).join('\n');
const text=`# Controlled testnet execution report — stopped after 6/23

The owner authorized resumption of steps 2–23. Transaction 1 was preserved and never repeated. Steps 2–6 were submitted once each and finalized successfully. No transaction failed onchain. Broadcasts stopped when the transaction-6 argument-comparison guard failed. Read-only reconciliation proved that the official CLI only reordered JSON keys: all actual values, method, gas, deposit, signer and receiver matched the approved plan. The comparison now uses structural equality. No transaction 7 or later was submitted; no automatic resume is enabled.

## Preconditions and network

Fresh Windows Credential Manager offchain signing checks passed for all five approved identities. Frozen plan SHA-256 remained 33266af8dab092cce7c4e5eea92d96cc539dd552dd8116a81895107902f11345. Approved WASM SHA-256 remained b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019. The approved free archival endpoint returned testnet status, finalized block, protocol, gas, account/key and finalized transaction queries without authentication, subscription or payment. Reads are serialized at a minimum two-second interval with four total attempts and 4/8/16-second bounded backoff for transient read failures. There is no broadcast retry. Initial restricted-sandbox fetch failure was resolved by running the read-only checks with network permission.

## Finalized transactions

| Step | Hash / explorer | Result | Fee, testnet NEAR |
|---|---|---|---|
${rows}

Step 1 funds verifier; 2 customer; 3 worker; 4 challenger, exactly 1 NEAR each. Step 5 atomically deployed and initialized the approved contract and verifier. Downloaded deployed WASM bytes matched the approved SHA-256. NEAR code hash: ${a.accounts.contract.code_hash}. Step 6 created actual job ID 0, state Open, 0.01 escrow and 0.16384 storage reserve (0.17384 total customer deposit). Its work deadline is ${s.jobs['0'].work_deadline} ns (${new Date(Number(BigInt(s.jobs['0'].work_deadline)/1000000n)).toISOString()}). No challenge window has begun.

## Actual balances and accounting

Finalized block ${a.block_height}, ${a.block_hash}; timestamp ${a.timestamp_ns} ns.

| Role | Testnet NEAR amount |
|---|---:|
${balances}

These account amounts include storage backing. Contract storage usage is ${a.accounts.contract.storage_usage} bytes, approximately ${near(BigInt(a.accounts.contract.storage_usage)*10n**19n)} NEAR at the verified byte cost. The contract holds unpaid escrow 0.01, storage reserves 0.16384, pending transfers 0, total paid 0 and total refunded 0. No escrow has been paid or refunded, once or twice.

Sum of outcome tokens_burnt: **${near(fees)} testnet NEAR**. Aggregate controlled balances: ${near(total)}; net reduction from initial 10: **${near(net)} NEAR**. Difference ${near(fees-net)} is consistent with contract execution gas rewards credited to the receiver. The conservative budget counts full outcome fees, without crediting rewards. Four role transfers + the entire 2-NEAR deployment storage allowance + fees = ${near(6n*10n**24n+fees)} NEAR, below the original 7-NEAR cap; customer job deposit is already within its 1-NEAR allocation. No paid resources or mainnet transactions were used.

## Incomplete outcomes and next checkpoint

Happy-path settlement: not executed. Challenge/refund: not executed. Expected rejection tests 10,17,18,19,22,23: none executed. Seeded verifier false positive: demonstration fixture only, no attestation submitted. No evidence of lifecycle completion is claimed.

Execution remains stopped after a reconciled local verification-tooling incident. Seek owner direction before continuing at step 7; do not repeat steps 1–6. Recheck job 0's real work deadline before any resume; an expired deadline may make the unchanged remaining plan impossible and require revised approval. Preserve actual challenge-window deadlines once attestations occur. Phase 2 cannot yet be closed. Phase 3 was not started. Remaining security assumptions include immutable verifier trust, full-access upgrade-key custody, receipt/callback liveness and free-RPC availability.

Evidence: testnet-execution/state.json, resume-precheck.json, step-01-rpc.json through step-06-rpc.json and per-step after snapshots. Commands: cargo run --offline --locked --manifest-path scripts/signing-readiness/Cargo.toml -- --check-replacements (after scripts/enter-msvc.ps1); node scripts/execute-testnet-plan.mjs resume-precheck; step 2, step 3, step 4, step 5, step 6; reconcile-json-order (read-only). Private credentials remained in Windows Credential Manager and were never printed/exported.
`;
writeFileSync('docs/TESTNET_EXECUTION_REPORT.md',text);
const note=`\n\nControlled resumption update: 6/23 transactions finalized successfully; deployed WASM matches the approved SHA-256; job 0 is Open with 0.01 unpaid escrow. Stopped after an order-sensitive JSON verification guard; exact approved arguments and finalized state reconciled read-only, no resubmission. Steps 7–23 remain unexecuted; settlement/refund and rejection tests remain outstanding. Fees ${near(fees)} testnet NEAR; conservative allocated budget ${near(6n*10n**24n+fees)} / 7 NEAR. See docs/TESTNET_EXECUTION_REPORT.md for hashes, current balances and deadline risk. Phase 2 remains incomplete; no Phase 3.\n`;
for(const p of ['docs/VERIFICATION.md','docs/TESTNET_DEPLOYMENT.md','README.md','PLAN.md'])appendFileSync(p,note);
writeFileSync('docs/TESTNET_RESUME_PLAN.md',`# Resume checkpoint after transaction 6\n\nAll six recorded transactions are FINAL success. Do not repeat them. Next unexecuted step: 7. Broadcasts remain stopped after the reconciled JSON key-order comparison incident. Refer to TESTNET_EXECUTION_REPORT.md and the journal for evidence and the real job deadline. Require owner direction before another broadcast, and fresh prerequisites before any resumed execution. The frozen plan, accepted WASM, identities and original 7-NEAR cap remain unchanged.\n`);
console.log(JSON.stringify({fees_NEAR:near(fees),net_balance_decrease_NEAR:near(net),conservative_allocation_NEAR:near(6n*10n**24n+fees),report:'docs/TESTNET_EXECUTION_REPORT.md',transactions:6}));
