# Directive 002-C — role signing recovery
Status: **offline replacement proposal prepared; stop before transactions**.

## Diagnosis and permitted search scope
The four original role IDs first appear in the product owner's public-ID reply. Project scripts and deployment documents contain no original role-key generation command or saved credential path. Their exact generation provenance cannot be established from the IDs. The user did not identify a generator or saved credential location and asked whether keys should be saved in a project text document; guidance was to use the OS keychain, never plaintext project files/chat.

Inspected only existing project generation/deployment scripts/docs, the official near-cli-rs 0.30.1 generation/keychain source, the configured NEAR credential root and standard documented subfolders, and account-filtered Windows Credential Manager metadata. No broad filesystem search, browser-profile inspection, unrelated credential enumeration or search through logs/history for secrets occurred.

Configured credential root: `C:\Users\USER\.near-credentials`. Its standard `testnet`/`implicit` directories and the project's `.near-credentials` directory are absent. The root listing contained public metadata files, not the role credential files. Windows Credential Manager metadata was queried with one exact public account-prefix filter per designated account. The contract matched one testnet entry; each original role matched zero entries. No credential blobs were read by the metadata inspection. Evidence: testnet-credential-store-inspection.json.

The original official testnet keychain signing check also reported no accessible entries for all four roles. No alternative documented project secure location was found. **No original role credential was recovered locally.** This does not rule out an external wallet or backup that was not supplied/inspected. A public implicit account ID cannot reconstruct its private key.

The official CLI `fund-later use-auto-generation save-to-folder` writes an account JSON including private material into the operator-selected folder. Merely copying its public ID is not credential backup. That command was not executed in this recovery assignment. Official source reviewed: https://github.com/near/near-cli-rs/blob/v0.30.1/src/commands/account/create_account/create_implicit_account/use_auto_generation.rs .

## Signing results
| Role | Original designated ID | Original status | Proposed replacement ID | Proposed local signing |
|---|---|---|---|---|
| Contract | `writbound-escrow-20261105.testnet` | PASS | `writbound-escrow-20261105.testnet` | PASS |
| Verifier | `1a23e55459c7e0503df815a0aff749c9834a0c315552709cfaadd94630083929` | Unavailable in checked local stores | `fcdcd131110d9310c74e6c340e114e92bd79044bbe049d275fadd7d6b3867831` | PASS |
| Customer | `2abfc6c4576095958e51f373b77b30c03be80058a9b1fa60d701e153ee01ff1a` | Unavailable in checked local stores | `7ac384032504d793e733f0210f5ee39518adb0db92dbc95ed9001b7af08cebf9` | PASS |
| Worker | `b265140f50d716b20d98d94ff2a4a9336c42cc52281fa124b952b16c4818bc60` | Unavailable in checked local stores | `75b826f8ba2f37eb9431805f7a19659f0ecd81e7458eeefd42663b9365a67f55` | PASS |
| Challenger | `30314a0c731301037ddce5c1716f14a977bf69136345cf11b835880071e768f7` | Unavailable in checked local stores | `7b1828f1acfc0003b06abf0744f9dea35f53ad105f4e14a24b0901de5a99465f` | PASS |

Four new cryptographically random Ed25519 seeds were generated offline from the operating system RNG, encoded in the official NEAR keychain JSON format and stored directly in Windows Credential Manager under the exact `near-testnet-<account>` service and `<account>:<public_key>` username. The official signer credential schema is `public_key` plus `private_key`; source reviewed: https://github.com/near/near-cli-rs/blob/v0.30.1/src/transaction_signature_options/mod.rs .

Each credential was read back locally and used to sign/verify a domain-separated **offchain** challenge against its public key. The existing contract credential also passed. This is signing readiness, not an onchain transaction or an activated account. No private key/seed was displayed, logged, saved as plaintext or committed. Only public IDs/public keys/statuses are in the proposal/report. OS keychain entries are tied to the local Windows user; losing that profile/keychain without secure backup can lose signing access. No plaintext recovery phrase/key file was created.

## Exact local actions
```powershell
# Read official CLI help; no generation, activation or transaction through these help calls.
$near = (Resolve-Path '.tools/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe').Path
& $near account create-account fund-later --help
& $near account create-account fund-later use-auto-generation --help
# Metadata-only inspection, restricted to each of the five public account prefixes:
python .tools/signing-check/inspect-metadata.py
# Prepare new candidate credentials directly in the OS keychain; no network code:
. ./scripts/enter-msvc.ps1
cargo run --offline --manifest-path .tools/signing-check/Cargo.toml -- --prepare-replacements
```
Preparation completed successfully. Source was preserved at `scripts/signing-readiness/` for review; its --prepare-replacements mode refuses to generate again while the public proposal already exists, avoiding silent replacement. The default mode checks the current canonical mapping, which still points to the original unrecovered role IDs. The generator writes only public proposal/proof JSON; private values go only to Windows Credential Manager. Dependencies were already cached and compilation was offline, with no paid services.

## Revised plan and approval boundary
The existing approved `testnet-accounts.json` remains unchanged. A separate public mapping is in `testnet-accounts.replacement-proposal.json`, and the revised 23-transaction proposal is `testnet-transaction-plan.replacement-proposal.json`. It retains the same contract account, accepted WASM hash, amounts, order, fixture labeling and expected rejection checks; it changes the four role IDs, activation recipients, signers and immutable verifier initialization argument.

Those identity changes are material. **The prior conditional deployment approval does not authorize them.** The original plan is marked non-executable pending recovery or replacement approval. Do not copy the replacement mapping into the canonical configuration, activate/fund candidates or deploy until the owner approves the revised account-specific packet. After approval, promote the mapping and rerun all-five signing, live balance/budget, exact WASM hash, testnet network and permissions checks.

Accepted artifact remains `b0e079d44375cda2baf0f242f5aa405d2c0cf158782b4817b9b0ce2284e30019`. Contract/AI/frontend/API code was not changed.

## Outcome and next action
- Original contract: can sign locally.
- Original verifier/customer/worker/challenger: cannot sign in the checked local stores; unrecovered.
- Proposed replacement verifier/customer/worker/challenger: can sign locally; no activation/funding performed.
- Agent blockchain transactions: **0**. No mainnet, deployment, transfer, paid service or Phase 3 work.
- Recommended next action: review/approve the replacement public identities and revised 23-transaction packet in a new deployment authorization, or recover the original credentials through a supported local wallet if a genuine backup is found. Never paste private keys/seed phrases into chat or save them in a project text document.
