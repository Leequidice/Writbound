import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
const paths=['docs/TESTNET_EXECUTION_REPORT.md','docs/testnet-execution-report.json',...readdirSync('docs/testnet-execution').filter(n=>/^step-0[2-6].*\.(json|log)$/.test(n)).map(n=>'docs/testnet-execution/'+n)];
const affected_files=paths.filter(p=>/"(?:private_key|seed_phrase|mnemonic)"\s*:\s*"[^"]{12,}"|-----BEGIN .*PRIVATE KEY/.test(readFileSync(p,'utf8')));
const result={checked_at:new Date().toISOString(),files_checked:paths.length,detected_secret_values:affected_files.length,affected_files,scope:'New execution reports and steps 2–6 public logs and receipts; labelled public signatures are not secrets. Pattern scan does not prove absence of arbitrary unlabelled secrets.'};
writeFileSync('docs/testnet-execution/resumption-secret-scan.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(affected_files.length)process.exitCode=1;
