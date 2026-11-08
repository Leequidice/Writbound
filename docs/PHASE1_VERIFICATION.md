# Verification — November 4, 2026

## Executed successfully
- npm install: 189 packages added; audit reported zero vulnerabilities.
- Python virtual environment created; editable worker and pandas dependencies installed. See requirements-lock.txt for observed versions.
- npm run build: strict TypeScript checks, Vite production build, and API compilation passed.
- npm test: 2 tests passed, including real HTTP requests, invalid query/JSON, payload limits, 404/500 handling, six-table initialization, foreign-key rejection and config validation.
- Python unittest discovery: 6 tests passed, covering exact duplicate removal, string preservation, idempotence, invalid encoding/content, traversal, missing files, and resource limits.
- node scripts/smoke.mjs: launched actual compiled API and Vite servers; GET /health returned HTTP 200 with database ready; frontend returned HTTP 200. Temporary smoke processes stopped afterward.
- Persistent SQLite inspection confirmed challenges, jobs, submissions, transaction_references, verification_results, worker_identities.

## Failures investigated
Initial venv initialization failed in sandbox; rerunning with environment permission succeeded. An early worker test run preceded completed installation. Sandbox restrictions subsequently denied temporary fixture access and localhost HTTP; reruns with permission passed. Original sandbox-bound development servers could not be reached by HTTP checks; the standalone smoke script starts and checks its own servers and passed outside the sandbox.

## Native Windows contract verification — Directive 001-B

MSVC/linker and Windows SDK blockers are resolved. The previous failed attempts are preserved in TOOLCHAIN_HISTORY.md.

| Component | Verified version |
|---|---|
| Rust compiler | 1.99.1 (58cf8f9c3 2026-10-13) |
| Cargo | 1.99.1 (5f94df478 2026-08-27) |
| rustup | 1.29.3 (edbc831ce 2026-11-02) |
| Host | stable-x86_64-pc-windows-msvc |
| Installed targets | wasm32-unknown-unknown, x86_64-pc-windows-msvc |
| Visual Studio Build Tools | 2026, 18.11.12328.437 |
| MSVC | 14.51.36231 |
| Windows SDK | 10.0.26100.0; x64 kernel32.lib present |
| near-sdk | exact existing pin 5.30.0; declared Rust minimum 1.95 satisfied |

MSVC tools are located at `C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Tools\MSVC\14.51.36231\bin\HostX64\x64`. The helper `scripts/enter-msvc.ps1` discovers Visual Studio through official vswhere, imports Microsoft.VisualStudio.DevShell.dll and enters the x64 developer environment. It adds the existing user Cargo bin to the current process PATH only. No persistent PATH edits or additional system installations were made.

### Native Rust tests: PASS
Executed from the repository root:
```powershell
. ./scripts/enter-msvc.ps1
Set-Location contracts/writbound-escrow
cargo test --locked
```
Result: one test, `tests::reports_foundation_version`, passed; zero failures. Zero doctests present. Test build finished successfully in 4m 37s. See rust-test.log. This is the full existing Rust test suite; no escrow transitions exist to test, and no onchain/sandbox deployment was performed.

Initial retry failed in aws-lc-sys because NASM was absent. The helper now sets `AWS_LC_SYS_PREBUILT_NASM=1`, using the crate's official Windows x64 non-FIPS assembly fallback rather than adding software or disabling optimized assembly. Retrying passed. Official reference: https://aws.github.io/aws-lc-rs/requirements/windows.html . Compiler feature probes emitted warnings, but the completed test build succeeded.

### Direct NEAR-configured WASM build: PASS
```powershell
. ./scripts/enter-msvc.ps1
Set-Location contracts/writbound-escrow
$env:RUSTFLAGS = '--cfg near'
cargo build --target wasm32-unknown-unknown --release --locked
```
Release build completed successfully in 2m 07s, using the near-sdk NEAR compilation configuration. Contract source and manifest were unchanged; Cargo.lock is retained.

From repository root:
```powershell
node scripts/verify-wasm.mjs contracts/writbound-escrow/target/wasm32-unknown-unknown/release/writbound_escrow.wasm
```
The direct artifact exists at:
`C:\Users\USER\Downloads\Hackathons\WritBound\contracts\writbound-escrow\target\wasm32-unknown-unknown\release\writbound_escrow.wasm`

Size: 41,584 bytes. SHA-256: `75b087e5a8f3f00ea7563a75ab645ebc983bb3664ad5eee0a58151fe9df162c0`.
Node WebAssembly.validate and WebAssembly.Module compilation succeeded. Exports: memory, contract_source_metadata, version. Imports are the expected NEAR env host functions (value_return, read_register, register_len, storage_read, panic_utf8). This validates module structure and entrypoint presence; it is not a NEAR chain execution test.

### cargo-near optimized WASM build: PASS
cargo-near 0.22.0 is available through the official portable Windows release. Source installation was attempted but first hit the NASM dependency, then missing Perl in bundled OpenSSL compilation. The second attempt was stopped after the fatal Perl error while Cargo waited for remaining jobs. No Perl/system installation was introduced.

Downloaded official archive:
https://github.com/near/cargo-near/releases/download/cargo-near-v0.22.0/cargo-near-x86_64-pc-windows-msvc.tar.gz

Checksum source: the same URL with `.sha256` appended. Verified archive SHA-256:
`c50ad7e3e220923db006c43668f25bdbe0c4612ca6d6b48d08e3c0b7532bf122`.

Portable executable location: `.tools/cargo-near/cargo-near-x86_64-pc-windows-msvc/cargo-near.exe`. `.tools/` is ignored by version control; the helper adds this directory to process PATH when present. Version command `cargo near --version` prints `cargo-near-near 0.22.0`. No installer scripts were executed.

Executed portable installation commands from repository root:
```powershell
New-Item -ItemType Directory -Force .tools/cargo-near | Out-Null
$base = 'https://github.com/near/cargo-near/releases/download/cargo-near-v0.22.0'
Invoke-WebRequest "$base/cargo-near-x86_64-pc-windows-msvc.tar.gz" -OutFile .tools/cargo-near/archive.tar.gz -TimeoutSec 120
Invoke-WebRequest "$base/cargo-near-x86_64-pc-windows-msvc.tar.gz.sha256" -OutFile .tools/cargo-near/archive.sha256 -TimeoutSec 30
$actual = (Get-FileHash .tools/cargo-near/archive.tar.gz -Algorithm SHA256).Hash.ToLowerInvariant()
$expected = ((Get-Content .tools/cargo-near/archive.sha256 -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
if ($actual -ne $expected) { throw 'Official archive checksum mismatch' }
tar -xzf .tools/cargo-near/archive.tar.gz -C .tools/cargo-near
```
The GitHub release was discovered with `Invoke-RestMethod https://api.github.com/repos/near/cargo-near/releases/latest`. An initial query for tag v0.22.0 returned 404; the actual tag is cargo-near-v0.22.0.

Source installation attempts (failed, not required with portable binary):
```powershell
. ./scripts/enter-msvc.ps1
cargo install cargo-near --version 0.22.0 --locked
# Second attempt reused build outputs after enabling AWS_LC_SYS_PREBUILT_NASM:
$env:CARGO_TARGET_DIR = 'C:\Users\USER\AppData\Local\Temp\cargo-installsFtMjT'
cargo install cargo-near --version 0.22.0 --locked
```
The target override was confined to that installation process, not the contract build. See cargo-near-install.log for missing Perl evidence.

Final build commands, in a fresh process from repository root:
```powershell
. ./scripts/enter-msvc.ps1
cargo near --version
Set-Location contracts/writbound-escrow
cargo near build non-reproducible-wasm --locked
cargo near build non-reproducible-wasm --locked --no-abi
```
The default build failed in optional native ABI DLL linking with 62 unresolved NEAR host symbols (LNK2019/LNK1120). `--no-abi` is the official SDK-documented workaround: https://github.com/near/near-sdk-rs . No SDK downgrade, fake host implementations, contract rewrite or disabled test was introduced. The final command completed in 16 seconds, including wasm-opt optimization. No ABI file is claimed.

Final artifact:
`C:\Users\USER\Downloads\Hackathons\WritBound\contracts\writbound-escrow\target\near\writbound_escrow.wasm`

Size: **21,549 bytes**. SHA-256: `8236c720de88223615ca6897fd2a1735245dd7799f7870163445cca836ec9081`.

Independent final check from repository root:
```powershell
node scripts/verify-wasm.mjs
```
Node validated the complete optimized module, compiled it as a WebAssembly.Module, confirmed the exported `version` function, and independently reproduced the size and SHA-256. Exports: memory, contract_source_metadata, version. NEAR env imports match the direct build. This is structural validation, not execution in the NEAR runtime. Build logs: near-build.log (ABI failure), near-build-no-abi.log (successful WASM).

### Acceptance outcome
Phase 1 foundation verification is complete: tool versions and targets verified, native unit test passed, optimized WASM compiled and independently validated. No required compiler/linker/SDK blocker remains for the documented `--no-abi` build. Optional native ABI generation remains a known compatibility limitation. There is no contract integration/sandbox test in this foundation and no onchain deployment is claimed.


### Scope and prior verification
Frontend, API and worker were unchanged in this assignment; their prior executed checks are listed above and were not rerun. No escrow logic, wallet integration, paid services, chain transactions, mainnet/testnet deployment, Docker, WSL or Phase 2 implementation occurred. Earlier source secret scan found no embedded credentials. Contract source compilation and one unit test do not verify the planned escrow product.
