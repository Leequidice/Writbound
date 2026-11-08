use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use rand_core::{OsRng,RngCore};
use zeroize::{Zeroize,Zeroizing};
use serde_json::{json, Value};
use std::fs;
use std::time::{SystemTime,UNIX_EPOCH};
fn public_bytes(key: &str) -> Option<[u8;32]> {
    bs58::decode(key.strip_prefix("ed25519:")?).into_vec().ok()?.try_into().ok()
}
fn check(account: &str, public_key: &str, challenge: &str) -> Value {
    let service=format!("near-testnet-{account}");
    let user=format!("{account}:{public_key}");
    let Some(expected) = public_bytes(public_key) else {return json!({"account_id":account,"verified":false,"reason":"Invalid expected public key"});};
    let credential=keyring::Entry::new(&service,&user).ok().and_then(|entry|entry.get_password().ok());
    let Some(secret_json)=credential.map(Zeroizing::new) else {return json!({"account_id":account,"public_key":public_key,"verified":false,"reason":"No accessible credential at official NEAR testnet keychain entry"});};
    let checked=(|| -> Option<bool> {
        let mut value: Value=serde_json::from_str(&secret_json).ok()?;
        if value.get("public_key")?.as_str()?!=public_key{return Some(false);}
        let private=value.get_mut("private_key")?.take();
        let encoded=private.as_str()?.strip_prefix("ed25519:")?;
        let mut decoded=bs58::decode(encoded).into_vec().ok()?;
        if decoded.len()!=64 && decoded.len()!=32{return Some(false);}
        let mut seed:[u8;32]=decoded[..32].try_into().ok()?;
        let signing=SigningKey::from_bytes(&seed);
        seed.zeroize();
        decoded.fill(0);
        let verifying=VerifyingKey::from_bytes(&expected).ok()?;
        if signing.verifying_key().to_bytes()!=expected{return Some(false);}
        let signature=signing.sign(challenge.as_bytes());
        Some(verifying.verify_strict(challenge.as_bytes(),&signature).is_ok())
    })().unwrap_or(false);
    json!({"account_id":account,"public_key":public_key,"verified":checked,"method":"local OS keychain, in-memory Ed25519 sign/verify of domain-separated offchain challenge","reason":if checked{"signature verified"}else{"credential/key/signature validation failed"}})
}
fn prepare_replacements() -> Result<(), ()> {
    let manifest="docs/testnet-accounts.replacement-proposal.json";
    if std::path::Path::new(manifest).exists(){eprintln!("Replacement proposal already exists; refusing to generate more credentials");return Err(());}
    let current:Value=serde_json::from_str(&fs::read_to_string("docs/testnet-accounts.json").map_err(|_|())?).map_err(|_|())?;
    let mut replacement=current.clone();
    let mut proofs=serde_json::Map::new();
    for role in ["verifier","customer","worker","challenger"] {
        let mut seed=Zeroizing::new([0u8;32]);
        OsRng.try_fill_bytes(&mut *seed).map_err(|_|())?;
        let signing=SigningKey::from_bytes(&seed);
        let raw=signing.verifying_key().to_bytes();
        let account:String=raw.iter().map(|b|format!("{b:02x}")).collect();
        let public=format!("ed25519:{}",bs58::encode(raw).into_string());
        let entry=keyring::Entry::new(&format!("near-testnet-{account}"),&format!("{account}:{public}")).map_err(|_|())?;
        if entry.get_password().is_ok(){return Err(());}
        let secret=Zeroizing::new(format!("ed25519:{}",bs58::encode(signing.to_keypair_bytes()).into_string()));
        let encoded=Zeroizing::new(serde_json::to_string(&json!({"public_key":public,"private_key":&*secret})).map_err(|_|())?);
        entry.set_password(&encoded).map_err(|_|())?;
        let proof=check(&account,&public,&format!("writbound:testnet:002-C:replacement-readiness:{role}:{account}"));
        if proof["verified"]!=true{return Err(());}
        replacement[role]=json!(account);proofs.insert(role.into(),proof);
    }
    let contract=current["contract"].as_str().ok_or(())?;
    let proof=check(contract,"ed25519:EfjHfxMYbW565rUaiAextpLMqEDhjYsLHDk3j37eSMn7",&format!("writbound:testnet:002-C:contract-readiness:{contract}"));
    let all=proof["verified"]==true&&proofs.values().all(|p|p["verified"]==true);proofs.insert("contract".into(),proof);
    fs::write(manifest,serde_json::to_string_pretty(&replacement).map_err(|_|())?+"\n").map_err(|_|())?;
    let report=json!({"status":"OFFLINE REPLACEMENT PROPOSAL ONLY; revised identities require fresh transaction approval","all_five_verified":all,"private_material_printed":false,"private_storage":"Windows Credential Manager, official NEAR testnet service/account format; no plaintext key files","onchain_transactions_submitted":0,"account_activation":"not attempted; no funding or RPC calls","original_approved_mapping_changed":false,"results":proofs});
    fs::write("docs/testnet-replacement-signing-readiness.json",serde_json::to_string_pretty(&report).map_err(|_|())?+"\n").map_err(|_|())?;
    println!("{}",serde_json::to_string_pretty(&report).map_err(|_|())?);
    if !all{return Err(());} Ok(())
}
fn main(){
    if std::env::args().any(|arg|arg=="--prepare-replacements") {
        if prepare_replacements().is_err(){eprintln!("Offline replacement preparation failed; no transactions were submitted; inspect public proposal/status only");std::process::exit(4);}
        return;
    }

    let replacements=std::env::args().any(|arg|arg=="--check-replacements");
    let account_file=if replacements {"docs/testnet-accounts.replacement-proposal.json"} else {"docs/testnet-accounts.json"};
    let accounts:Value=match fs::read_to_string(account_file).ok().and_then(|v|serde_json::from_str(&v).ok()){Some(v)=>v,None=>{eprintln!("Public account configuration unavailable");std::process::exit(2)}};
    let challenge=format!("writbound:testnet:002-B:signing-readiness:{}",SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos());
    let mut results=serde_json::Map::new();
    for role in ["contract","verifier","customer","worker","challenger"] {
        let account=accounts[role].as_str().unwrap();
        let public=if role=="contract"{"ed25519:EfjHfxMYbW565rUaiAextpLMqEDhjYsLHDk3j37eSMn7".to_owned()}
        else {let raw:Vec<u8>=(0..64).step_by(2).map(|i|u8::from_str_radix(&account[i..i+2],16).unwrap()).collect();format!("ed25519:{}",bs58::encode(raw).into_string())};
        results.insert(role.into(),check(account,&public,&format!("{challenge}:{account}")));
    }
    let passed=results.values().all(|r|r["verified"]==true);
    let report=json!({"network":"testnet","all_five_verified":passed,"private_material_printed":false,"onchain_transactions_submitted":0,"results":results});
    fs::write(if replacements {"docs/final-testnet-signing-readiness.json"} else {"docs/testnet-signing-readiness.json"},serde_json::to_string_pretty(&report).unwrap()+"\n").unwrap();
    println!("{}",serde_json::to_string_pretty(&report).unwrap());
    if !passed {std::process::exit(3);}
}
