# Writbound

**Autonomous work. Binding accountability.**

This draft describes the frozen three-task release candidate. The public repository currently points to the earlier approved release, `31b19ebf9172420454e03d2b630bf67ce0cf9e1d`. Publish the candidate only after owner authorization. Record its exact commit from the release handoff when updating the submission.

## Submission fields

The official portal is [nearhackathon.com/#apply](https://nearhackathon.com/#apply). The deadline is November 14, 2026 at 23:59 UTC, or November 15 at 00:59 WAT. A local application needs a public repository, reproducible setup, and a public X post with a video. The organizer also requires a LICENSE file. [Official instructions, checked November 11](https://nearhackathon.com/HACKATHON.md)

| Field | Draft value or owner input |
| --- | --- |
| Project name | Writbound |
| Team lead | Owner input required |
| Email | Owner input required |
| Team size | Owner selects `1`, `2 - 4`, `4 - 6`, `6 - 8`, or `8+` |
| Proposed tracks | Agent Economy (`agents`) and Autonomous Business (`business`), subject to owner confirmation |
| NEAR prize account | Owner-confirmed public mainnet account ID |
| Repository | https://github.com/Leequidice/Writbound |
| Demo post | `<PUBLIC_X_DEMO_POST_URL>` |
| Optional video mirror | `<DEMO_VIDEO_URL>` |
| Website | Leave blank while the application is local |
| Contact consent | Owner decision required |

The consent notice is “I agree that the organizers may use these details to review our submission and contact us about this hackathon.”

## What did you build?

Writbound makes AI work accountable through explicit acceptance rules, reproducible deliverables, independent checks, and NEAR escrow evidence. It supports three local workflows: CSV cleaning, JSON transformation, and data quality audits. Local Ollama qwen2.5:3b proposes a schema-constrained plan. Restricted Python tools execute only validated, allowlisted operations. A separate deterministic reference path reconstructs the expected output from the original dataset and specification, reports the artifact SHA-256, and identifies the first mismatch. Each workflow includes a working demo and an intentionally defective artifact that verification rejects.

The historical CSV demonstration uses a Rust escrow contract on NEAR testnet. Job 1 paid the worker 0.01 testnet NEAR after the full one-hour challenge window. Job 2 refunded the customer 0.01 testnet NEAR after challenge 0 was upheld. Both transfer callbacks finalized, and all 12 workflow transactions are documented.

The defective CSV's positive attestation was deliberately seeded to demonstrate the challenge path. Verdicts and adjudication depend on a trusted offchain verifier. Fresh local work orders run separately from the historical onchain escrows. The new JSON workflows have local execution and verification evidence. This hackathon prototype has no production security audit.

## One-sentence pitch

Writbound coordinates AI work, independent deliverable checks, challenge evidence, and NEAR escrow accountability.

## Short description

Create a CSV-cleaning, JSON-transformation, or data-quality work order. A local AI worker proposes the execution plan, restricted tools produce the artifact, and an independent deterministic verifier checks it. Historical NEAR testnet jobs demonstrate a worker payout and an upheld-challenge refund.

## Problem and implementation

A plausible AI output can conceal missing records or incorrect values. Customers need acceptance criteria they can reproduce, and workers need evidence that supports payment. Writbound ties each local job to its original input, structured rules, generated plan, downloadable artifact, and verification report.

The React dashboard uses an Express API and SQLite job store. A bounded Python subprocess validates the specification and calls local Ollama qwen2.5:3b over loopback. The model sees enabled operation flags and returns a constrained operations array. The executor applies the user's validated arguments. CSV tools clean strings and records; JSON tools transform flat records or produce structured audit findings. An independent reference implementation reconstructs the expected result from the source and rules. CSV verification compares exact canonical bytes. JSON verification compares canonical content and hashes the actual candidate bytes.

## NEAR integration and real evidence

The existing Rust/near-sdk contract at `writbound-escrow-20261105.testnet` records commitments, enforces roles and deadlines, and settles payout or refund through asynchronous transfer callbacks. The dashboard reads finalized chain state and links the published receipts. Transaction preparation supports the CSV workflow, with signing handled externally.

- Job 1 reached Paid after its one-hour challenge window. [Finalized worker payout](https://testnet.nearblocks.io/txns/5LsHwiapTRiAncof3WBbUxbw8J9vXRKkdp9WmJeusXf)
- Job 2 reached Refunded after challenge 0 was upheld without correction. [Finalized customer refund](https://testnet.nearblocks.io/txns/Dd3hyXRQFKWNobm1WSZNBDjkCD6PgS1kKJmqzwr9qnHL)
- All 12 workflow transaction references, artifact hashes, transfers, and callbacks are preserved. [Previously published evidence](https://github.com/Leequidice/Writbound/blob/31b19ebf9172420454e03d2b630bf67ce0cf9e1d/docs/ONCHAIN_EVIDENCE.md)

## Limitations and disclosures

The application runs on a trusted local machine. JSON input is limited to flat scalar records, with bounded sizes and explicit rules. An audit report can pass verification while correctly reporting dataset violations. The reference verifiers share published data conventions and comparison primitives with execution tools. Contract verdicts and challenge adjudication rely on the designated trusted offchain verifier. Participants need access to the committed artifacts and reports. The historical onchain defective-work positive attestation was deliberately seeded. JSON execution and verification are local, and fresh work orders do not automatically create or settle escrow. The prototype uses testnet and has no production security audit.

## Updated X caption

Can you verify the AI work you pay for? Built Writbound at NEAR HACKATHON: 3 local AI data tasks, independent checks, and historical NEAR testnet payout/refund evidence. The challenge demo used a seeded positive attestation. @NEARProtocol #NEARHackathon

Attach a newly recorded three-task video. The existing local videos show the earlier CSV release. Publish the post and insert its real permalink only after owner authorization.

## Video outline — 130 seconds

**0–12 seconds.** Open Overview. Say, “AI can finish a task quickly, but how do you know the deliverable meets the rules? Writbound connects a work order to a downloadable result, an independent check, and evidence for payment or dispute.”

**12–42 seconds.** Start a fresh CSV demo and open Worker. Say, “Here is a local CSV-cleaning request. Ollama proposes the permitted operations, and restricted tools execute them. Five input rows become three. I can download the actual CSV and verify it against a separately reproduced result.” Show the passing check. Trim idle waiting and label any time cut.

**42–65 seconds.** Show a fresh JSON-transformation result and download. Say, “The same workflow transforms JSON records. This request renames fields, filters records, normalizes strings, fills missing values, and selects the output fields. The verifier catches this defective artifact because its team value is null.” Show the mismatch.

**65–87 seconds.** Show the audit report. Say, “The third task audits data quality. It found six rule violations in three records. Verification passes because the report is accurate. A defective report claiming zero findings fails.”

**87–117 seconds.** Open Treasury. Say, “These are historical finalized NEAR testnet outcomes from the CSV workflow. Job 1 paid the worker 0.01 testnet NEAR. Job 2 refunded the customer after an upheld challenge. We deliberately seeded that defective-work positive attestation. The designated offchain verifier remains trusted.” Show both callbacks.

**117–130 seconds.** Return to Overview. Say, “Fresh local work runs separately from those historical escrows. The repository includes setup, fixtures, and the transaction evidence so you can reproduce the checks.” End on the repository URL.

## Optional video mirror copy

Title — Writbound | Three Verifiable AI Workflows and NEAR Escrow Evidence

Suggested visibility — Unlisted, followed by a signed-out playback check after an authorized upload.

Description — Writbound runs CSV cleaning, JSON transformation, and data quality audits with local Ollama planning, restricted execution, and independent deterministic verification. The historical NEAR testnet CSV workflows show a finalized worker payout and challenged refund. The defective-work positive attestation was deliberately seeded, and the offchain verifier remains trusted. Source and setup are at https://github.com/Leequidice/Writbound. The three-task release and video publication require owner authorization.

## Remaining submission steps

- Approve the release candidate and authorize its GitHub push.
- Choose a license and confirm the copyright holder. MIT is recommended, pending approval. [MIT license](https://opensource.org/license/mit)
- Record and review the new video, then authorize publication and provide the actual X permalink.
- Confirm team lead, email, team size, tracks, public prize account, and consent.
- If submitting another independent project, confirm and add the organizer-required cross-project disclosure to each README. [Organizer rules](https://nearhackathon.com/HACKATHON.md)
- Review the exact final submission payload and separately authorize submission.
