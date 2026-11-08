use super::*;
use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
use near_sdk::{testing_env, PromiseResult, RuntimeFeesConfig};
use std::collections::HashMap;

const T: u64 = DAY * 100;
const AMOUNT: u128 = 5_000_000_000_000_000_000_000_000;
fn account(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn hash() -> String {
    "a".repeat(64)
}
fn context(who: &str, time: u64, deposit: u128) -> VMContextBuilder {
    let mut c = VMContextBuilder::new();
    c.current_account_id(account("escrow.testnet"))
        .signer_account_id(account(who))
        .predecessor_account_id(account(who))
        .block_timestamp(time)
        .account_balance(NearToken::from_near(1000))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .prepaid_gas(Gas::from_tgas(300));
    c
}
fn call(who: &str, time: u64) {
    testing_env!(context(who, time, 0).build());
}
fn fresh() -> Contract {
    call("escrow.testnet", T);
    near_sdk::mock::with_mocked_blockchain(|b| {
        b.take_storage();
    });
    Contract::new(account("verifier.testnet"))
}
fn create(c: &mut Contract) -> U64 {
    let reserve = c.storage_quote().0;
    testing_env!(context("customer.testnet", T, AMOUNT + reserve).build());
    c.create_job(U128(AMOUNT), hash(), U64(T + DAY), U64(HOUR))
}
fn accepted() -> (Contract, U64) {
    let mut c = fresh();
    let id = create(&mut c);
    call("worker.testnet", T + 1);
    c.accept_job(id);
    (c, id)
}
fn submitted() -> (Contract, U64) {
    let (mut c, id) = accepted();
    call("worker.testnet", T + 2);
    c.submit_work(id, hash(), Some("ipfs://commitment".into()));
    (c, id)
}
fn verified() -> (Contract, U64) {
    let (mut c, id) = submitted();
    call("verifier.testnet", T + 3);
    c.attest_verification(id, true, hash());
    (c, id)
}
fn challenged() -> (Contract, U64) {
    let (mut c, id) = verified();
    call("challenger.testnet", T + 4);
    c.open_challenge(id, hash());
    (c, id)
}
fn end(c: &Contract, id: U64) -> u64 {
    c.get_job(id)
        .unwrap()
        .submissions
        .last()
        .unwrap()
        .challenge_end
        .unwrap()
        .0
}
fn rejects(f: impl FnOnce()) {
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).is_err());
}
fn state(c: &Contract, id: U64) -> State {
    c.get_job(id).unwrap().state
}
fn callback(c: &mut Contract, id: U64, attempt: u64, result: PromiseResult) -> bool {
    testing_env!(
        context("escrow.testnet", T + 10 * DAY, 0).build(),
        near_sdk::test_vm_config(),
        RuntimeFeesConfig::test(),
        HashMap::default(),
        vec![result]
    );
    c.on_transfer(id, U64(attempt))
}
fn conservation(c: &Contract, funded: u128) {
    let a = c.get_accounting();
    assert_eq!(
        a.unpaid_escrow.0 + a.pending_transfers.0 + a.total_paid.0 + a.total_refunded.0,
        funded
    );
    let mut unpaid = 0;
    let mut pending = 0;
    for j in c.list_jobs(U64(0), 50) {
        match j.state {
            State::Paid | State::Refunded => {}
            State::PayoutPending | State::RefundPending => pending += j.escrow.0,
            _ => unpaid += j.escrow.0,
        }
    }
    assert_eq!(a.unpaid_escrow.0, unpaid);
    assert_eq!(a.pending_transfers.0, pending);
}

#[test]
fn valid_creation_and_queries() {
    let mut c = fresh();
    let id = create(&mut c);
    let j = c.get_job(id).unwrap();
    assert_eq!(j.customer, account("customer.testnet"));
    assert_eq!(j.escrow, U128(AMOUNT));
    assert_eq!(j.state, State::Open);
    assert_eq!(c.get_job_count(), U64(1));
    assert_eq!(c.list_jobs(U64(0), 10).len(), 1);
    assert_eq!(c.get_verifier(), account("verifier.testnet"));
    conservation(&c, AMOUNT);
}
#[test]
fn invalid_funding_and_hashes() {
    let mut c = fresh();
    let fee = c.storage_quote().0;
    testing_env!(context("customer.testnet", T, fee).build());
    rejects(|| {
        c.create_job(U128(0), hash(), U64(T + DAY), U64(HOUR));
    });
    for deposit in [AMOUNT, AMOUNT + fee - 1, AMOUNT + fee + 1] {
        testing_env!(context("customer.testnet", T, deposit).build());
        rejects(|| {
            c.create_job(U128(AMOUNT), hash(), U64(T + DAY), U64(HOUR));
        });
    }
    testing_env!(context("customer.testnet", T, AMOUNT + fee).build());
    for bad in ["x".repeat(64), "A".repeat(64), "a".repeat(63), "".into()] {
        rejects(|| {
            c.create_job(U128(AMOUNT), bad, U64(T + DAY), U64(HOUR));
        });
    }
    assert_eq!(c.get_job_count(), U64(0));
}
#[test]
fn invalid_deadline_bounds() {
    let mut c = fresh();
    let fee = c.storage_quote().0;
    testing_env!(context("customer.testnet", T, AMOUNT + fee).build());
    for deadline in [T - 1, T, T + HOUR - 1, T + 30 * DAY + 1] {
        rejects(|| {
            c.create_job(U128(AMOUNT), hash(), U64(deadline), U64(HOUR));
        });
    }
    for duration in [0, HOUR - 1, 7 * DAY + 1] {
        rejects(|| {
            c.create_job(U128(AMOUNT), hash(), U64(T + DAY), U64(duration));
        });
    }
}
#[test]
fn worker_accepts_once() {
    let (mut c, id) = accepted();
    assert_eq!(
        c.get_job(id).unwrap().worker,
        Some(account("worker.testnet"))
    );
    call("other.testnet", T + 2);
    rejects(|| c.accept_job(id));
    call("customer.testnet", T + 2);
    rejects(|| c.accept_job(id));
}
#[test]
fn customer_verifier_and_contract_cannot_work() {
    let mut c = fresh();
    let id = create(&mut c);
    for who in ["customer.testnet", "verifier.testnet", "escrow.testnet"] {
        call(who, T + 1);
        rejects(|| c.accept_job(id));
    }
}
#[test]
fn verifier_cannot_fund_job() {
    let mut c = fresh();
    let fee = c.storage_quote().0;
    testing_env!(context("verifier.testnet", T, AMOUNT + fee).build());
    rejects(|| {
        c.create_job(U128(AMOUNT), hash(), U64(T + DAY), U64(HOUR));
    });
}
#[test]
fn unauthorized_submission_rejected() {
    let (mut c, id) = accepted();
    call("other.testnet", T + 2);
    rejects(|| c.submit_work(id, hash(), None));
}
#[test]
fn valid_submission_stores_commitment() {
    let (c, id) = submitted();
    let j = c.get_job(id).unwrap();
    assert_eq!(j.state, State::Submitted);
    assert_eq!(j.submissions[0].artifact_hash, hash());
    assert_eq!(j.submissions[0].timestamp, U64(T + 2));
}
#[test]
fn bounded_metadata_and_no_resubmission() {
    let (mut c, id) = accepted();
    call("worker.testnet", T + 2);
    rejects(|| c.submit_work(id, hash(), Some("x".repeat(257))));
    rejects(|| c.submit_work(id, hash(), Some("x\n".into())));
    c.submit_work(id, hash(), Some("x".repeat(256)));
    rejects(|| c.submit_work(id, hash(), None));
}
#[test]
fn successful_verification_and_immutable_attestation() {
    let (mut c, id) = verified();
    let j = c.get_job(id).unwrap();
    assert_eq!(j.state, State::Verified);
    assert!(j.submissions[0].verification.as_ref().unwrap().passed);
    assert_eq!(end(&c, id), T + 3 + HOUR);
    rejects(|| c.attest_verification(id, false, hash()));
}
#[test]
fn unauthorized_verifier_rejected() {
    let (mut c, id) = submitted();
    call("other.testnet", T + 3);
    rejects(|| c.attest_verification(id, true, hash()));
}
#[test]
fn rejected_verification_refunds() {
    let (mut c, id) = submitted();
    call("verifier.testnet", T + 3);
    c.attest_verification(id, false, hash());
    assert_eq!(state(&c, id), State::Refundable);
    rejects(|| {
        drop(c.settle_job(id));
    });
}
#[test]
fn settlement_before_deadline_rejected() {
    let (mut c, id) = verified();
    call("anyone.testnet", end(&c, id) - 1);
    rejects(|| {
        drop(c.settle_job(id));
    });
}
#[test]
fn settlement_at_boundary_and_callback_succeeds() {
    let (mut c, id) = verified();
    call("anyone.testnet", end(&c, id));
    drop(c.settle_job(id));
    assert_eq!(state(&c, id), State::PayoutPending);
    conservation(&c, AMOUNT);
    let receipts = format!("{:?}", get_created_receipts());
    assert!(receipts.contains("worker.testnet") && receipts.contains(&AMOUNT.to_string()));
    assert!(callback(&mut c, id, 1, PromiseResult::Successful(vec![])));
    assert_eq!(state(&c, id), State::Paid);
    assert_eq!(c.get_accounting().total_paid, U128(AMOUNT));
    conservation(&c, AMOUNT);
}
#[test]
fn duplicate_settlement_and_refund_rejected() {
    let (mut c, id) = verified();
    call("anyone.testnet", end(&c, id));
    drop(c.settle_job(id));
    rejects(|| {
        drop(c.settle_job(id));
    });
    rejects(|| {
        drop(c.refund_job(id));
    });
    callback(&mut c, id, 1, PromiseResult::Successful(vec![]));
    call("customer.testnet", T + DAY);
    rejects(|| {
        drop(c.settle_job(id));
    });
    rejects(|| {
        drop(c.refund_job(id));
    });
    rejects(|| c.cancel_job(id));
}
#[test]
fn third_party_challenge_blocks_settlement() {
    let (mut c, id) = challenged();
    assert_eq!(
        c.get_job(id).unwrap().challenges[0].state,
        ChallengeState::Pending
    );
    call("anyone.testnet", end(&c, id));
    rejects(|| {
        drop(c.settle_job(id));
    });
}
#[test]
fn invalid_and_late_challenges() {
    let (mut c, id) = verified();
    call("challenger.testnet", T + 4);
    rejects(|| {
        c.open_challenge(id, "bad".into());
    });
    call("challenger.testnet", end(&c, id));
    rejects(|| {
        c.open_challenge(id, hash());
    });
}
#[test]
fn participants_cannot_challenge() {
    let (mut c, id) = verified();
    for who in [
        "customer.testnet",
        "worker.testnet",
        "verifier.testnet",
        "escrow.testnet",
    ] {
        call(who, T + 4);
        rejects(|| {
            c.open_challenge(id, hash());
        });
    }
}
#[test]
fn challenge_duplicates_and_count_bounded() {
    let (mut c, id) = challenged();
    rejects(|| {
        c.open_challenge(id, hash());
    });
    for i in 1..4 {
        call(&format!("challenger{i}.testnet"), T + 5);
        c.open_challenge(id, hash());
    }
    call("fifth.testnet", T + 6);
    rejects(|| {
        c.open_challenge(id, hash());
    });
}
#[test]
fn valid_challenge_enters_correction() {
    let (mut c, id) = challenged();
    call("verifier.testnet", T + 5);
    c.resolve_challenge(id, 0, true, true, hash());
    let j = c.get_job(id).unwrap();
    assert_eq!(j.state, State::CorrectionRequired);
    assert_eq!(j.correction_deadline, Some(U64(T + 5 + DAY)));
    rejects(|| {
        drop(c.settle_job(id));
    });
    rejects(|| {
        drop(c.refund_job(id));
    });
}
#[test]
fn valid_challenge_can_refund_directly() {
    let (mut c, id) = challenged();
    call("verifier.testnet", T + 5);
    c.resolve_challenge(id, 0, true, false, hash());
    assert_eq!(state(&c, id), State::Refundable);
}
#[test]
fn rejected_challenge_allows_settlement() {
    let (mut c, id) = challenged();
    call("verifier.testnet", T + 5);
    c.resolve_challenge(id, 0, false, false, hash());
    call("anyone.testnet", end(&c, id));
    drop(c.settle_job(id));
    assert_eq!(state(&c, id), State::PayoutPending);
}
#[test]
fn all_challenges_must_resolve() {
    let (mut c, id) = challenged();
    call("second.testnet", T + 5);
    c.open_challenge(id, hash());
    call("verifier.testnet", T + 6);
    c.resolve_challenge(id, 0, false, false, hash());
    call("anyone.testnet", end(&c, id));
    rejects(|| {
        drop(c.settle_job(id));
    });
}
#[test]
fn unauthorized_resolution_rejected() {
    let (mut c, id) = challenged();
    call("customer.testnet", T + 5);
    rejects(|| c.resolve_challenge(id, 0, true, false, hash()));
}
#[test]
fn work_timeout_for_open_and_accepted() {
    for accepted in [false, true] {
        let mut c = fresh();
        let id = create(&mut c);
        if accepted {
            call("worker.testnet", T + 1);
            c.accept_job(id);
        }
        call("anyone.testnet", T + DAY - 1);
        rejects(|| c.expire_job(id));
        call("anyone.testnet", T + DAY);
        c.expire_job(id);
        assert_eq!(state(&c, id), State::Refundable);
    }
}
#[test]
fn work_cannot_submit_or_accept_at_deadline() {
    let mut c = fresh();
    let id = create(&mut c);
    call("worker.testnet", T + DAY);
    rejects(|| c.accept_job(id));
    let (mut c, id) = accepted();
    call("worker.testnet", T + DAY);
    rejects(|| c.submit_work(id, hash(), None));
}
#[test]
fn verification_timeout_is_permissionless() {
    let (mut c, id) = submitted();
    call("verifier.testnet", T + 2 + DAY);
    rejects(|| c.attest_verification(id, true, hash()));
    call("anyone.testnet", T + 2 + DAY);
    c.expire_job(id);
    assert_eq!(state(&c, id), State::Refundable);
}
#[test]
fn challenge_timeout_deterministic_refund() {
    let (mut c, id) = challenged();
    call("verifier.testnet", T + 4 + DAY);
    rejects(|| c.resolve_challenge(id, 0, false, false, hash()));
    call("anyone.testnet", T + 4 + DAY);
    c.expire_job(id);
    assert_eq!(state(&c, id), State::Refundable);
    assert_eq!(
        c.get_job(id).unwrap().challenges[0].state,
        ChallengeState::TimedOut
    );
    drop(c.refund_job(id));
    assert!(callback(&mut c, id, 1, PromiseResult::Successful(vec![])));
    assert_eq!(state(&c, id), State::Refunded);
    conservation(&c, AMOUNT);
}
#[test]
fn correction_timeout_refunds() {
    let (mut c, id) = challenged();
    call("verifier.testnet", T + 5);
    c.resolve_challenge(id, 0, true, true, hash());
    call("worker.testnet", T + 5 + DAY);
    rejects(|| c.submit_work(id, hash(), None));
    call("anyone.testnet", T + 5 + DAY);
    c.expire_job(id);
    assert_eq!(state(&c, id), State::Refundable);
}
#[test]
fn correction_resubmission_reverifies_and_cannot_loop() {
    let (mut c, id) = challenged();
    call("verifier.testnet", T + 5);
    c.resolve_challenge(id, 0, true, true, hash());
    call("worker.testnet", T + 6);
    c.submit_work(id, "b".repeat(64), None);
    call("anyone.testnet", T + 7);
    rejects(|| {
        drop(c.settle_job(id));
    });
    call("verifier.testnet", T + 7);
    c.attest_verification(id, true, hash());
    call("challenger.testnet", T + 8);
    let challenge = c.open_challenge(id, hash());
    call("verifier.testnet", T + 9);
    c.resolve_challenge(id, challenge, true, true, hash());
    assert_eq!(state(&c, id), State::Refundable);
    assert_eq!(c.get_job(id).unwrap().submissions.len(), 2);
}
#[test]
fn customer_cancels_only_unaccepted_job() {
    let mut c = fresh();
    let id = create(&mut c);
    call("other.testnet", T + 1);
    rejects(|| c.cancel_job(id));
    call("customer.testnet", T + 1);
    c.cancel_job(id);
    rejects(|| c.accept_job(id));
    let (mut c, id) = accepted();
    call("customer.testnet", T + 2);
    rejects(|| c.cancel_job(id));
    rejects(|| {
        drop(c.refund_job(id));
    });
}
#[test]
fn failed_worker_transfer_preserves_claim_and_retry() {
    let (mut c, id) = verified();
    call("anyone.testnet", end(&c, id));
    drop(c.settle_job(id));
    assert!(!callback(&mut c, id, 1, PromiseResult::Failed));
    assert_eq!(state(&c, id), State::PaymentReady);
    conservation(&c, AMOUNT);
    call("customer.testnet", T + 10 * DAY);
    rejects(|| {
        drop(c.refund_job(id));
    });
    drop(c.settle_job(id));
    assert_eq!(c.get_job(id).unwrap().transfer_attempt, U64(2));
    assert!(!callback(&mut c, id, 1, PromiseResult::Successful(vec![])));
    assert_eq!(state(&c, id), State::PayoutPending);
    assert!(callback(&mut c, id, 2, PromiseResult::Successful(vec![])));
    conservation(&c, AMOUNT);
}
#[test]
fn failed_refund_preserves_customer_claim() {
    let mut c = fresh();
    let id = create(&mut c);
    call("customer.testnet", T + 1);
    c.cancel_job(id);
    drop(c.refund_job(id));
    assert!(!callback(&mut c, id, 1, PromiseResult::Failed));
    assert_eq!(state(&c, id), State::Refundable);
    call("anyone.testnet", T + 2);
    drop(c.refund_job(id));
    assert!(callback(&mut c, id, 2, PromiseResult::Successful(vec![])));
    conservation(&c, AMOUNT);
}
#[test]
fn callback_private_and_replay_safe() {
    let (mut c, id) = verified();
    call("anyone.testnet", end(&c, id));
    drop(c.settle_job(id));
    rejects(|| {
        c.on_transfer(id, U64(1));
    });
    assert!(callback(&mut c, id, 1, PromiseResult::Successful(vec![])));
    assert!(!callback(&mut c, id, 1, PromiseResult::Successful(vec![])));
    conservation(&c, AMOUNT);
}
#[test]
fn storage_is_never_worker_payment() {
    let (mut c, id) = verified();
    let reserve = c.storage_quote();
    assert_eq!(c.get_accounting().storage_reserves, reserve);
    call("anyone.testnet", end(&c, id));
    drop(c.settle_job(id));
    assert_eq!(c.get_accounting().pending_transfers, U128(AMOUNT));
    callback(&mut c, id, 1, PromiseResult::Successful(vec![]));
    assert_eq!(c.get_accounting().total_paid, U128(AMOUNT));
    assert_eq!(c.get_accounting().storage_reserves, reserve);
}
#[test]
fn multiple_job_liabilities_are_isolated() {
    let (mut c, id) = verified();
    let second = create(&mut c);
    call("customer.testnet", T + 4);
    c.cancel_job(second);
    drop(c.refund_job(second));
    conservation(&c, AMOUNT * 2);
    callback(&mut c, second, 1, PromiseResult::Successful(vec![]));
    call("anyone.testnet", end(&c, id));
    drop(c.settle_job(id));
    callback(&mut c, id, 1, PromiseResult::Successful(vec![]));
    conservation(&c, AMOUNT * 2);
}
#[test]
fn minimum_callback_gas_enforced() {
    let (mut c, id) = verified();
    let mut ctx = context("anyone.testnet", end(&c, id), 0);
    ctx.prepaid_gas(Gas::from_tgas(90));
    testing_env!(ctx.build());
    rejects(|| {
        drop(c.settle_job(id));
    });
    assert_eq!(state(&c, id), State::Verified);
    conservation(&c, AMOUNT);
}
#[test]
fn paginated_queries_and_unknown_ids() {
    let mut c = fresh();
    create(&mut c);
    assert!(c.get_job(U64(999)).is_none());
    assert!(c.list_jobs(U64(u64::MAX), 50).is_empty());
    rejects(|| {
        c.list_jobs(U64(0), 51);
    });
    rejects(|| c.accept_job(U64(999)));
}
#[test]
fn verified_work_cannot_expire_arbitrarily() {
    let (mut c, id) = verified();
    call("customer.testnet", T + 40 * DAY);
    rejects(|| c.expire_job(id));
    rejects(|| {
        drop(c.refund_job(id));
    });
}
#[test]
fn closed_jobs_cannot_reenter_workflow() {
    let mut c = fresh();
    let id = create(&mut c);
    call("customer.testnet", T + 1);
    c.cancel_job(id);
    call("worker.testnet", T + 2);
    rejects(|| c.accept_job(id));
    rejects(|| c.submit_work(id, hash(), None));
    call("verifier.testnet", T + 3);
    rejects(|| c.attest_verification(id, true, hash()));
}

#[test]
fn worst_case_history_storage_and_callback_gas() {
    let mut c = fresh();
    let before = env::storage_usage();
    let id = create(&mut c);
    call("worker.testnet", T + 1);
    c.accept_job(id);
    call("worker.testnet", T + 2);
    c.submit_work(id, hash(), Some("m".repeat(256)));
    for round in 0..2u64 {
        let time = T + 3 + round * 10;
        call("verifier.testnet", time);
        c.attest_verification(id, true, hash());
        for index in 0..4u8 {
            let name = format!("{}{}.testnet", "z".repeat(55), index);
            call(&name, time + 1);
            c.open_challenge(id, hash());
        }
        for index in 0..4u8 {
            call("verifier.testnet", time + 2);
            c.resolve_challenge(
                id,
                (round as u8) * 4 + index,
                round == 0 && index == 3,
                true,
                hash(),
            );
        }
        if round == 0 {
            call("worker.testnet", time + 3);
            c.submit_work(id, "b".repeat(64), Some("n".repeat(256)));
        }
    }
    assert_eq!(c.get_job(id).unwrap().challenges.len(), 8);
    c.jobs.flush();
    let storage = env::storage_usage() - before;
    assert!(storage <= STORAGE_BYTES, "storage used {storage}");
    call("anyone.testnet", end(&c, id));
    drop(c.settle_job(id));
    c.jobs.flush();
    let encoded = near_sdk::borsh::to_vec(&c).unwrap();
    let mut c: Contract = near_sdk::borsh::from_slice(&encoded).unwrap();
    let mut ctx = context("escrow.testnet", T + DAY, 0);
    ctx.prepaid_gas(CALLBACK_GAS);
    testing_env!(
        ctx.build(),
        near_sdk::test_vm_config(),
        RuntimeFeesConfig::test(),
        HashMap::default(),
        vec![PromiseResult::Successful(vec![])]
    );
    assert!(c.on_transfer(id, U64(1)));
    c.jobs.flush();
    env::state_write(&c);
    assert!(env::used_gas().as_gas() < Gas::from_tgas(35).as_gas());
    conservation(&c, AMOUNT);
}
#[test]
fn challenge_timeout_cannot_be_bypassed_by_resolving_another() {
    let (mut c, id) = challenged();
    call("second.testnet", T + 5);
    c.open_challenge(id, hash());
    call("verifier.testnet", T + 4 + DAY);
    rejects(|| c.resolve_challenge(id, 1, true, true, hash()));
    call("anyone.testnet", T + 4 + DAY);
    c.expire_job(id);
    assert_eq!(state(&c, id), State::Refundable);
}
#[test]
fn successful_callback_with_data_does_not_restore_claim() {
    let (mut c, id) = verified();
    call("anyone.testnet", end(&c, id));
    drop(c.settle_job(id));
    assert!(callback(
        &mut c,
        id,
        1,
        PromiseResult::Successful(vec![1; 1024])
    ));
    assert_eq!(state(&c, id), State::Paid);
    conservation(&c, AMOUNT);
}
#[test]
fn insufficient_liquidity_does_not_erase_claim() {
    let (mut c, id) = verified();
    let mut ctx = context("anyone.testnet", end(&c, id), 0);
    ctx.account_balance(NearToken::from_yoctonear(0));
    testing_env!(ctx.build());
    rejects(|| {
        drop(c.settle_job(id));
    });
    assert_eq!(state(&c, id), State::Verified);
    conservation(&c, AMOUNT);
}
#[test]
fn timestamp_overflow_rejected_before_funding() {
    let mut c = fresh();
    let fee = c.storage_quote().0;
    testing_env!(context("customer.testnet", u64::MAX - 2 * DAY, AMOUNT + fee).build());
    rejects(|| {
        c.create_job(U128(AMOUNT), hash(), U64(u64::MAX - DAY), U64(HOUR));
    });
}
#[test]
fn initialization_rejects_self_verifier_and_non_testnet_name() {
    call("escrow.testnet", T);
    rejects(|| {
        Contract::new(account("escrow.testnet"));
    });
    let mut ctx = context("escrow.testnet", T, 0);
    ctx.current_account_id(account("escrow.near"));
    testing_env!(ctx.build());
    rejects(|| {
        Contract::new(account("verifier.testnet"));
    });
}

#[test]
fn initialization_cannot_be_front_run() {
    call("attacker.testnet", T);
    rejects(|| {
        Contract::new(account("attacker.testnet"));
    });
}
#[test]
fn payout_receipts_fix_amount_recipient_and_callback_gas() {
    use near_sdk::mock::MockAction;
    let (mut c, id) = verified();
    call("anyone.testnet", end(&c, id));
    drop(c.settle_job(id));
    let receipts = get_created_receipts();
    let transfer = receipts
        .iter()
        .find(|r| r.receiver_id == account("worker.testnet"))
        .unwrap();
    assert!(transfer
        .actions
        .iter()
        .any(|a| matches!(a,MockAction::Transfer{deposit,..} if deposit.as_yoctonear()==AMOUNT)));
    let cb = receipts
        .iter()
        .find(|r| r.receiver_id == account("escrow.testnet"))
        .unwrap();
    assert!(cb.actions.iter().any(|a|matches!(a,MockAction::FunctionCallWeight{method_name,prepaid_gas,attached_deposit,..} if method_name==b"on_transfer" && *prepaid_gas==CALLBACK_GAS && attached_deposit.as_yoctonear()==0)));
}
