# Phase 2 security and trust design
The contract is the authority for native NEAR escrow. SQLite/frontend/model have no power to bypass contract state. No CSV or arbitrary program is executed onchain. A 64-character lowercase SHA-256 commitment identifies exact task, artifact or evidence bytes; it does not establish correctness. Deterministic checks must be published with the task and verifier implementation in later phases.

## Roles
- Customer: creates/funds jobs, cancels only unaccepted open jobs, receives objectively eligible refunds; cannot assign/reassign or reclaim verified payable work.
- Worker: any explicit predecessor account other than customer, designated verifier or contract can accept an open job; only the assigned worker submits/corrects. Sybil resistance and worker allowlisting are not claimed.
- Challenger: third-party predecessor, excluding customer/worker/verifier/contract, commits evidence during a verified submission window. At most one challenge per account per revision and four per revision.
- Verifier: immutable account selected at initialization; exclusively approves/rejects submissions and adjudicates challenges before deadlines. Cannot create/accept jobs or receive worker/customer escrow. May collude, censor, lie or remain unavailable; timeout refunds limit locks, not verifier dishonesty. Cannot choose payment recipients.
- Administrator: none in contract methods. No verifier rotation, pause, upgrade or emergency withdrawal method. Initialization requires the contract-account predecessor; deploy+init must be atomic. The deployment account's remaining access keys can still replace code: use a dedicated testnet account and disclose key custody; code immutability is not claimed unless keys are removed externally.

## Accounting/input constraints
Exact funding rejects underpayment, overpayment and zero escrow. Storage cost is a separately quoted nonrefundable reserve for permanent bounded history. Each job is independently funded; unbounded number of jobs requires corresponding storage funding. Metadata is bounded to 256 UTF-8 bytes per submission, two submissions, eight bounded challenges. Checked arithmetic and u64 IDs avoid truncation. Queries paginate IDs, at most 50 jobs. Mutations reject deposits except job creation. Every timestamp is chain time; no backend clock is authoritative.

## Transfer safety
Scheduling moves funds to a pending state before promise execution. Only a private self callback with one runtime promise result and a matching attempt ID may finalize. Failed payouts/refunds preserve immutable original beneficiary claims and are retryable permissionlessly. No expiry of pending transfers is permitted. Gas is bounded for callbacks and a minimum prepaid gas is checked. Unit mocks can test scheduling and callback state transitions but cannot prove real receipt execution; a real dedicated-testnet lifecycle needs user approval and remains a deployment gate.

## Review gates
Review state/deadline boundaries, worst-case storage, liability conservation, unauthorized calls, multiple challenges, callback replay and retries. Verify optimized exports and test outcomes. No mainnet deployment, paid services, wallet secrets or Phase 3 implementation. Local completion alone is reported as deployment pending.

Account naming ending .testnet is an implementation guard, not a network-ID oracle; operators must separately verify the live RPC chain_id before any transaction. Native token protocol changes, storage byte cost changes or external account deletion are outside this contract's authority.


## Directive 002-B account/deployment review
Verifier configuration is immutable in the accepted WASM. There is no replacement/recovery method and no state migration; replacement requires a separately reviewed deployment. The contract owner retaining a full-access key can still deploy different code and thereby alter these guarantees, so immutable-verifier semantics depend on code/key custody.

The contract account must be a named .testnet account, while verifier/customer/worker/challenger may be valid 64-hex implicit IDs. The initially supplied Contract ID was implicit and cannot initialize this artifact; no guard was silently removed. At the preflight final block, all five supplied IDs were UNKNOWN_ACCOUNT, not confirmed zero-balance active accounts. A public ID alone proves neither activation nor local signing control. The user selected guided named-contract setup with ed25519/OS keychain; activation and final approval remain pending.

The controlled challenge demo proposes an explicitly labelled false-positive verifier attestation on a genuinely failing fixture, so a valid challenge can demonstrate recovery. This is fault injection under product-owner approval, never a claimed successful full verification. Local fixture check reports preserve the actual failure result. No financial contract source change was made in this predeployment phase.
