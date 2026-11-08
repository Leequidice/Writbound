# Environment inspection — November 4, 2026
Workspace was empty; no existing repository files or AGENTS.md were found in the workspace or its immediate parent. No existing files were overwritten.

| Component | Observed |
|---|---|
| OS | Windows NT 10.0.26300 |
| Shell | PowerShell Core 7.6.5 |
| Node / npm | v24.8.0 / 11.6.0 |
| Python / pip | 3.13.7 / 25.2 |
| Git | 2.51.0.windows.1 |
| Rust / Cargo / rustup | commands unavailable |
| cargo-near | unavailable because Cargo is absent |
| Ollama | command unavailable |

Also checked the conventional user Cargo executable and local Ollama executable paths; neither was found. The wasm target cannot be inspected without rustup. No Rust installation was performed; contract compilation and Rust unit tests are blocked, rather than passed.

## Official guidance reviewed
- https://docs.near.org/smart-contracts/quickstart
- https://github.com/near/near-sdk-rs
- https://docs.rs/near-sdk/latest/near_sdk/

Official guidance requires Rust, wasm32-unknown-unknown, and cargo-near. Build locally using `cargo near build non-reproducible-wasm` (no Docker required). Source pins near-sdk 5.30.0, the version found in current official crate documentation. Native Windows Rust may require Microsoft C++ build tools. After installation run the commands in README and record actual results. No account or deployment is needed for Phase 1.


## Superseded toolchain observations
The initial missing-Rust observations above are historical. Rust/Cargo 1.99.1, rustup 1.29.3, both required targets, MSVC 14.51.36231, Windows SDK 10.0.26100.0 and portable cargo-near 0.22.0 are now verified. Rust tests and the optimized --no-abi WASM build pass. See VERIFICATION.md for current evidence.
