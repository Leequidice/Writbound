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

## Original Phase 1 blockers (historical)
Rust, Cargo, rustup and cargo-near are unavailable. Contract compilation and its Rust unit test were not executed. No escrow transitions exist to test. No browser visual QA was performed; frontend serving and build were verified. Full product end-to-end tests await later phases.

## Cost and secrets
No paid service, model API, deployment, wallet signing or financial transaction was used. Source review and pattern scan found no credential files or embedded secret values; .env.example contains configuration only. Dependency/build/virtual-environment/database outputs are ignored. This is a local foundation, not a public GitHub publication.


## Initial Directive 001-B inspection (historical)
Status at initial inspection: awaiting user installation. See resumed verification below for current results.

Observed Windows X64. Get-Command found no rustc, cargo, rustup, cargo-near, cl or link. CARGO_HOME and RUSTUP_HOME are unset. Standard user .cargo/bin and .rustup directories, local Programs/Rust, legacy Program Files Rust directory and Visual Studio Installer/vswhere.exe were absent. No WASM artifact exists under contracts/writbound-escrow. No existing installation was identified to repair via PATH; nonstandard locations cannot be ruled out.

Installed Rust/Cargo/rustup/cargo-near versions: none found. WASM target: not inspectable without rustup. No installer was run, no PATH was changed, and no contract source was changed. Contract build and Rust tests have not run. No deployment, transaction, Docker, WSL or paid service was used.

Official guidance reviewed:
- https://rust-lang.org/tools/install/
- https://learn.microsoft.com/en-us/windows/dev-environment/rust/setup
- https://docs.near.org/smart-contracts/quickstart
- https://github.com/near/cargo-near

### User installation required
1. Obtain Microsoft C++ Build Tools from https://visualstudio.microsoft.com/visual-cpp-build-tools/ . Select Desktop development with C++, including the recommended MSVC x64/x86 compiler and Windows SDK. This graphical/system installation requires user approval and may request elevation.
2. Download official x64 rustup installer: https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe . Run it and choose the default stable x86_64-pc-windows-msvc toolchain. The default installation adds the user Cargo bin directory to user PATH; this is an explicit user-approved installation step.
3. Restart PowerShell and the Codex app so processes inherit the updated user PATH. Tell the agent when installation is complete.

### Exact inspection commands executed
Executed in PowerShell from the repository root (directory listings and documentation reads also performed):
```powershell
Get-Command rustc,cargo,rustup,cargo-near,cl,link,winget -All -ErrorAction SilentlyContinue | Select-Object Name,Source
$env:PATH
Get-ChildItem "$env:USERPROFILE\.cargo\bin","$env:USERPROFILE\.rustup\toolchains" -ErrorAction SilentlyContinue
Get-Content contracts/writbound-escrow/Cargo.toml
Get-Content contracts/writbound-escrow/src/lib.rs
rg --files -g AGENTS.md -g Cargo.toml -g rust-toolchain.toml -g config.toml
$locations = @("$env:USERPROFILE\.cargo\bin", "$env:USERPROFILE\.rustup", "$env:LOCALAPPDATA\Programs\Rust", 'C:\Program Files\Rust stable MSVC 1.0', 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe')
foreach ($location in $locations) { [pscustomobject]@{Path=$location; Exists=(Test-Path -LiteralPath $location)} }
[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
Write-Output "CARGO_HOME=$env:CARGO_HOME RUSTUP_HOME=$env:RUSTUP_HOME"
Get-ChildItem 'C:\Program Files\Microsoft Visual Studio','C:\Program Files (x86)\Windows Kits' -ErrorAction SilentlyContinue | Select-Object FullName
Get-ChildItem -LiteralPath contracts/writbound-escrow -Filter '*.wasm' -Recurse | Select-Object FullName
```

### Pending commands (NOT executed)
```powershell
rustc --version
cargo --version
rustup --version
rustup show
rustup target add wasm32-unknown-unknown
rustup target list --installed
cargo install cargo-near --locked
cargo near --version
cd contracts/writbound-escrow
cargo test
cargo near build non-reproducible-wasm
```
The existing manifest pins near-sdk 5.30.0 and enables unit-testing only for dev dependencies. Retain the architecture; dependency compatibility is not yet confirmed through Cargo resolution or compilation. Use cargo-near's documented build flow (which supplies the NEAR compilation configuration), then inspect the actual generated artifact and record its absolute path, size and hash. No WASM location is claimed before a successful build.


## Resumed Directive 001-B — actual results
Current status: Phase 1 remains incomplete because the native MSVC linker is unavailable. Rust installation itself is resolved.

| Item | Observed result |
|---|---|
| rustc | 1.99.1 (58cf8f9c3 2026-10-13) |
| cargo | 1.99.1 (5f94df478 2026-08-27) |
| rustup | 1.29.3 (edbc831ce 2026-11-02) |
| Host | stable-x86_64-pc-windows-msvc, active/default |
| Installed targets | wasm32-unknown-unknown; x86_64-pc-windows-msvc |
| near-sdk | Existing exact pin 5.30.0 retained; downloaded manifest declares rust-version 1.95, satisfied by 1.99.1 |
| cargo-near | Installation of 0.22.0 attempted, failed at missing link.exe; not installed |
| Rust tests | cargo test failed during dependency build; no tests executed or passed |
| WASM build | Direct release build failed during host dependency build: linker link.exe not found |
| WASM artifact | None produced or found; no artifact path/hash claimed |

### Changes made
Added Cargo's existing user bin directory to subprocess PATH only; no persistent/user/system PATH edits. Downloaded free crates and generated contracts/writbound-escrow/Cargo.lock (retain for dependency locking). No contract manifest or Rust source changes were needed. Frontend, API and worker were untouched. Prior non-Rust verification results above were not rerun in this assignment.

### Exact build and version commands executed
PowerShell version checks initially used full executable paths because this chat inherited an older PATH:
```powershell
& "$env:USERPROFILE\.cargo\bin\rustc.exe" --version
& "$env:USERPROFILE\.cargo\bin\cargo.exe" --version
& "$env:USERPROFILE\.cargo\bin\rustup.exe" --version
& "$env:USERPROFILE\.cargo\bin\rustup.exe" show
& "$env:USERPROFILE\.cargo\bin\cargo.exe" near --version
```
The last command reported no such command: near.

For subsequent command processes:
```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
rustc --version
cargo --version
rustup --version
rustup target list --installed
cargo install cargo-near --locked
```
Installation failed with linker `link.exe` not found. From contracts/writbound-escrow:
```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo test
```
Dependency resolution succeeded and generated Cargo.lock; native dependency compilation failed before any tests ran. A separate process attempted the direct build fallback:
```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:RUSTFLAGS = '--cfg near'
cargo build --target wasm32-unknown-unknown --release --locked
```
It also failed because procedural macros/build scripts require the native linker. This direct fallback is not a successful cargo-near optimized artifact build.

Inspection included Get-Command for Rust tools; Get-Content of the contract manifest/source; standard toolchain/config searches; checking Visual Studio installer/vswhere and standard install directories; recursive searches for link.exe and VsDevCmd.bat under the existing Visual Studio 2019 directory; and recursive *.wasm inspection under contract target. A read-only check outside the sandbox confirmed vswhere absent and no linker/developer script in the checked Visual Studio folder. The broad initial directory search was stopped after narrower checks completed.

### Remaining blocker and next action
Install official Microsoft C++ Build Tools from https://visualstudio.microsoft.com/visual-cpp-build-tools/ with Desktop development with C++, recommended MSVC x64/x86 compiler/linker and Windows SDK. Restart PowerShell/Codex; use a Developer PowerShell if necessary. Per the directive, graphical/elevated installation is left to the user. No installer or persistent PATH change was performed by the agent.

Then retry cargo-near installation, cargo test --locked, and cargo near build non-reproducible-wasm --locked. Verify the produced artifact's real path, WASM validity, exports, size and SHA-256 before declaring Phase 1 complete. Compatibility is confirmed at the declared Rust-version/dependency-resolution level only, not by a successful compile or runtime execution. No paid service, chain transaction, deployment, Docker/WSL or Phase 2 work was performed.
