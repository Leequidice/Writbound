use near_sdk::json_types::{U128, U64};
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
};

pub const HOUR: u64 = 3_600_000_000_000;
pub const DAY: u64 = 24 * HOUR;
pub const STORAGE_BYTES: u64 = 16_384;
const CALLBACK_GAS: Gas = Gas::from_tgas(40);

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum State {
    Open,
    Accepted,
    Submitted,
    Verified,
    CorrectionRequired,
    Refundable,
    PayoutPending,
    RefundPending,
    PaymentReady,
    Paid,
    Refunded,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum ChallengeState {
    Pending,
    Rejected,
    Upheld,
    Superseded,
    TimedOut,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Verification {
    pub passed: bool,
    pub evidence_hash: String,
    pub timestamp: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Submission {
    pub artifact_hash: String,
    pub metadata: Option<String>,
    pub timestamp: U64,
    pub verification_deadline: U64,
    pub verification: Option<Verification>,
    pub challenge_end: Option<U64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Challenge {
    pub id: u8,
    pub revision: u8,
    pub challenger: AccountId,
    pub evidence_hash: String,
    pub opened_at: U64,
    pub resolution_deadline: U64,
    pub state: ChallengeState,
    pub resolution_hash: Option<String>,
    pub resolved_at: Option<U64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Job {
    pub id: U64,
    pub customer: AccountId,
    pub worker: Option<AccountId>,
    pub escrow: U128,
    pub storage_reserve: U128,
    pub specification_hash: String,
    pub created_at: U64,
    pub work_deadline: U64,
    pub challenge_duration: U64,
    pub state: State,
    pub accepted_at: Option<U64>,
    pub refund_eligible_at: Option<U64>,
    pub submissions: Vec<Submission>,
    pub challenges: Vec<Challenge>,
    pub correction_deadline: Option<U64>,
    pub refund_reason: Option<String>,
    pub transfer_attempt: U64,
    pub transfer_completed_at: Option<U64>,
}

#[near(serializers = [json])]
pub struct Accounting {
    pub unpaid_escrow: U128,
    pub pending_transfers: U128,
    pub storage_reserves: U128,
    pub total_paid: U128,
    pub total_refunded: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    verifier: AccountId,
    jobs: LookupMap<u64, Job>,
    next_job: u64,
    unpaid: u128,
    pending: u128,
    storage_reserves: u128,
    paid: u128,
    refunded: u128,
}

#[near]
impl Contract {
    #[init]
    pub fn new(verifier: AccountId) -> Self {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "Initialization must be signed by contract account"
        );
        require!(
            env::current_account_id().as_str().ends_with(".testnet"),
            "Dedicated .testnet account required"
        );
        require!(
            verifier != env::current_account_id(),
            "Verifier must be a separate account"
        );
        Self {
            verifier,
            jobs: LookupMap::new(b"j"),
            next_job: 0,
            unpaid: 0,
            pending: 0,
            storage_reserves: 0,
            paid: 0,
            refunded: 0,
        }
    }

    pub fn version(&self) -> String {
        "writbound-escrow-0.2.0".into()
    }
    pub fn get_verifier(&self) -> AccountId {
        self.verifier.clone()
    }
    pub fn storage_quote(&self) -> U128 {
        U128(
            env::storage_byte_cost()
                .as_yoctonear()
                .checked_mul(STORAGE_BYTES as u128)
                .expect("Storage cost overflow"),
        )
    }
    pub fn get_accounting(&self) -> Accounting {
        Accounting {
            unpaid_escrow: U128(self.unpaid),
            pending_transfers: U128(self.pending),
            storage_reserves: U128(self.storage_reserves),
            total_paid: U128(self.paid),
            total_refunded: U128(self.refunded),
        }
    }
    pub fn get_job(&self, job_id: U64) -> Option<Job> {
        self.jobs.get(&job_id.0).cloned()
    }
    pub fn get_job_count(&self) -> U64 {
        U64(self.next_job)
    }
    pub fn list_jobs(&self, from_index: U64, limit: u32) -> Vec<Job> {
        require!((1..=50).contains(&limit), "Limit must be 1..50");
        (from_index.0..from_index.0.saturating_add(limit as u64).min(self.next_job))
            .filter_map(|id| self.jobs.get(&id).cloned())
            .collect()
    }

    #[payable]
    pub fn create_job(
        &mut self,
        escrow: U128,
        specification_hash: String,
        work_deadline: U64,
        challenge_duration: U64,
    ) -> U64 {
        Self::hash(&specification_hash);
        let customer = env::predecessor_account_id();
        require!(
            customer != self.verifier && customer != env::current_account_id(),
            "Customer is ineligible"
        );
        require!(escrow.0 > 0, "Escrow must be nonzero");
        let now = env::block_timestamp();
        let duration = work_deadline
            .0
            .checked_sub(now)
            .expect("Work deadline is in the past");
        require!(
            (HOUR..=30 * DAY).contains(&duration),
            "Work deadline must be 1 hour..30 days ahead"
        );
        require!(
            (HOUR..=7 * DAY).contains(&challenge_duration.0),
            "Challenge duration must be 1 hour..7 days"
        );
        // Ensure every later fixed-duration timestamp also fits u64.
        require!(
            work_deadline.0.checked_add(20 * DAY).is_some(),
            "Timestamp overflow"
        );
        let reserve = self.storage_quote().0;
        let required = escrow.0.checked_add(reserve).expect("Funding overflow");
        require!(
            env::attached_deposit().as_yoctonear() == required,
            "Attach exactly escrow plus storage_quote"
        );
        let _lifetime_funded = self
            .paid
            .checked_add(self.refunded)
            .and_then(|v| v.checked_add(self.pending))
            .and_then(|v| v.checked_add(self.unpaid))
            .and_then(|v| v.checked_add(escrow.0))
            .expect("Lifetime funding overflow");
        let id = self.next_job;
        self.next_job = id.checked_add(1).expect("Job ID overflow");
        self.unpaid = self.unpaid.checked_add(escrow.0).expect("Escrow overflow");
        self.storage_reserves = self
            .storage_reserves
            .checked_add(reserve)
            .expect("Reserve overflow");
        let job = Job {
            id: U64(id),
            customer,
            worker: None,
            escrow,
            storage_reserve: U128(reserve),
            specification_hash,
            created_at: U64(now),
            work_deadline,
            challenge_duration,
            state: State::Open,
            submissions: vec![],
            challenges: vec![],
            correction_deadline: None,
            refund_reason: None,
            accepted_at: None,
            refund_eligible_at: None,
            transfer_attempt: U64(0),
            transfer_completed_at: None,
        };
        self.save(job);
        U64(id)
    }

    pub fn accept_job(&mut self, job_id: U64) {
        let mut j = self.load(job_id);
        require!(j.state == State::Open, "Job is not open");
        require!(
            env::block_timestamp() < j.work_deadline.0,
            "Work deadline reached"
        );
        let worker = env::predecessor_account_id();
        require!(
            worker != j.customer && worker != self.verifier && worker != env::current_account_id(),
            "Worker is ineligible"
        );
        j.worker = Some(worker);
        j.accepted_at = Some(U64(env::block_timestamp()));
        j.state = State::Accepted;
        self.save(j);
    }

    pub fn submit_work(&mut self, job_id: U64, artifact_hash: String, metadata: Option<String>) {
        Self::hash(&artifact_hash);
        require!(
            metadata
                .as_ref()
                .is_none_or(|m| m.len() <= 256 && !m.chars().any(char::is_control)),
            "Metadata exceeds 256 bytes or contains controls"
        );
        let mut j = self.load(job_id);
        require!(
            j.worker.as_ref() == Some(&env::predecessor_account_id()),
            "Assigned worker only"
        );
        let deadline = match j.state {
            State::Accepted => j.work_deadline.0,
            State::CorrectionRequired => {
                j.correction_deadline
                    .expect("Correction deadline missing")
                    .0
            }
            _ => env::panic_str("Job does not permit submission"),
        };
        let now = env::block_timestamp();
        require!(
            now < deadline && j.submissions.len() < 2,
            "Submission deadline reached or correction limit exhausted"
        );
        j.submissions.push(Submission {
            artifact_hash,
            metadata,
            timestamp: U64(now),
            verification_deadline: U64(Self::after(now, DAY)),
            verification: None,
            challenge_end: None,
        });
        j.state = State::Submitted;
        self.save(j);
    }

    pub fn attest_verification(&mut self, job_id: U64, passed: bool, evidence_hash: String) {
        self.only_verifier();
        Self::hash(&evidence_hash);
        let mut j = self.load(job_id);
        require!(
            j.state == State::Submitted,
            "Job is not awaiting verification"
        );
        let now = env::block_timestamp();
        let s = j.submissions.last_mut().expect("Submission missing");
        require!(
            now < s.verification_deadline.0,
            "Verification deadline reached"
        );
        s.verification = Some(Verification {
            passed,
            evidence_hash,
            timestamp: U64(now),
        });
        if passed {
            s.challenge_end = Some(U64(Self::after(now, j.challenge_duration.0)));
            j.state = State::Verified;
        } else {
            Self::refundable(&mut j, "verification_rejected");
        }
        self.save(j);
    }

    pub fn open_challenge(&mut self, job_id: U64, evidence_hash: String) -> u8 {
        Self::hash(&evidence_hash);
        let mut j = self.load(job_id);
        require!(j.state == State::Verified, "Job is not challengeable");
        let now = env::block_timestamp();
        require!(
            now < j.submissions.last().unwrap().challenge_end.unwrap().0,
            "Challenge window ended"
        );
        let who = env::predecessor_account_id();
        require!(
            who != j.customer
                && j.worker.as_ref() != Some(&who)
                && who != self.verifier
                && who != env::current_account_id(),
            "Independent challenger required"
        );
        let revision = j.submissions.len() as u8;
        let current: Vec<_> = j
            .challenges
            .iter()
            .filter(|c| c.revision == revision)
            .collect();
        require!(
            current.len() < 4 && current.iter().all(|c| c.challenger != who),
            "Challenge limit or duplicate challenger"
        );
        let id = j.challenges.len() as u8;
        j.challenges.push(Challenge {
            id,
            revision,
            challenger: who,
            evidence_hash,
            opened_at: U64(now),
            resolution_deadline: U64(Self::after(now, DAY)),
            state: ChallengeState::Pending,
            resolution_hash: None,
            resolved_at: None,
        });
        self.save(j);
        id
    }

    pub fn resolve_challenge(
        &mut self,
        job_id: U64,
        challenge_id: u8,
        upheld: bool,
        allow_correction: bool,
        resolution_hash: String,
    ) {
        self.only_verifier();
        Self::hash(&resolution_hash);
        let mut j = self.load(job_id);
        require!(
            j.state == State::Verified,
            "Job is not under verified review"
        );
        let now = env::block_timestamp();
        // Do not permit resolving one challenge to bypass another expired pending challenge.
        require!(
            !Self::expired_challenge(&j, now),
            "Challenge resolution deadline reached; refund required"
        );
        let c = j
            .challenges
            .get_mut(challenge_id as usize)
            .expect("Unknown challenge");
        require!(
            c.state == ChallengeState::Pending && c.revision as usize == j.submissions.len(),
            "Challenge is not pending for this revision"
        );
        c.state = if upheld {
            ChallengeState::Upheld
        } else {
            ChallengeState::Rejected
        };
        c.resolution_hash = Some(resolution_hash);
        c.resolved_at = Some(U64(now));
        if upheld {
            Self::supersede_pending(&mut j, now);
            if allow_correction && j.submissions.len() == 1 {
                j.state = State::CorrectionRequired;
                j.correction_deadline = Some(U64(Self::after(now, DAY)));
            } else {
                Self::refundable(&mut j, "challenge_upheld");
            }
        }
        self.save(j);
    }

    pub fn cancel_job(&mut self, job_id: U64) {
        let mut j = self.load(job_id);
        require!(env::predecessor_account_id() == j.customer, "Customer only");
        require!(
            j.state == State::Open,
            "Only unaccepted jobs can be cancelled"
        );
        Self::refundable(&mut j, "customer_cancelled");
        self.save(j);
    }

    pub fn expire_job(&mut self, job_id: U64) {
        let mut j = self.load(job_id);
        let now = env::block_timestamp();
        let reason = match j.state {
            State::Open | State::Accepted if now >= j.work_deadline.0 => "work_timeout",
            State::Submitted if now >= j.submissions.last().unwrap().verification_deadline.0 => {
                "verification_timeout"
            }
            State::CorrectionRequired if now >= j.correction_deadline.unwrap().0 => {
                "correction_timeout"
            }
            State::Verified if Self::expired_challenge(&j, now) => "challenge_resolution_timeout",
            _ => env::panic_str("No eligible timeout"),
        };
        for c in &mut j.challenges {
            if c.state == ChallengeState::Pending && now >= c.resolution_deadline.0 {
                c.state = ChallengeState::TimedOut;
                c.resolved_at = Some(U64(now));
            }
        }
        Self::supersede_pending(&mut j, now);
        Self::refundable(&mut j, reason);
        self.save(j);
    }

    pub fn settle_job(&mut self, job_id: U64) -> Promise {
        let j = self.load(job_id);
        if j.state == State::Verified {
            let s = j.submissions.last().unwrap();
            require!(
                s.verification.as_ref().is_some_and(|v| v.passed),
                "Successful verification required"
            );
            require!(
                env::block_timestamp() >= s.challenge_end.unwrap().0,
                "Challenge window is still open"
            );
            require!(
                j.challenges
                    .iter()
                    .all(|c| c.state != ChallengeState::Pending),
                "Unresolved challenge"
            );
        } else {
            require!(j.state == State::PaymentReady, "Job is not payable");
        }
        let recipient = j.worker.clone().expect("Worker missing");
        self.schedule(j, recipient, false)
    }

    pub fn refund_job(&mut self, job_id: U64) -> Promise {
        let j = self.load(job_id);
        require!(j.state == State::Refundable, "Job is not refundable");
        let recipient = j.customer.clone();
        self.schedule(j, recipient, true)
    }

    #[private]
    pub fn on_transfer(&mut self, job_id: U64, attempt: U64) -> bool {
        // Explicit checks also protect direct Rust unit calls (the wrapper enforces private).
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "Private callback only"
        );
        let mut j = self.load(job_id);
        if j.transfer_attempt != attempt
            || !matches!(j.state, State::PayoutPending | State::RefundPending)
        {
            return false;
        }
        require!(
            env::promise_results_count() == 1,
            "One transfer result required"
        );
        let success = !matches!(env::promise_result_checked(0, 0), Err(PromiseError::Failed));
        let refund = j.state == State::RefundPending;
        self.pending -= j.escrow.0;
        if success {
            if refund {
                self.refunded += j.escrow.0;
                j.state = State::Refunded;
            } else {
                self.paid += j.escrow.0;
                j.state = State::Paid;
            }
            j.transfer_completed_at = Some(U64(env::block_timestamp()));
        } else {
            self.unpaid += j.escrow.0;
            j.state = if refund {
                State::Refundable
            } else {
                State::PaymentReady
            };
        }
        self.save(j);
        success
    }
}

impl Contract {
    fn load(&self, id: U64) -> Job {
        self.jobs.get(&id.0).expect("Unknown job").clone()
    }
    fn save(&mut self, job: Job) {
        // Bound complete serialized history independently of actual lazy-map flush timing.
        let length = near_sdk::borsh::to_vec(&job)
            .expect("Job serialization failed")
            .len();
        require!(
            length + 1024 <= STORAGE_BYTES as usize,
            "Job storage reserve exceeded"
        );
        self.jobs.insert(job.id.0, job);
    }
    fn hash(value: &str) {
        require!(
            value.len() == 64
                && value
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
            "Expected lowercase SHA-256 hex"
        );
    }
    fn after(now: u64, duration: u64) -> u64 {
        now.checked_add(duration).expect("Timestamp overflow")
    }
    fn only_verifier(&self) {
        require!(
            env::predecessor_account_id() == self.verifier,
            "Designated verifier only"
        );
    }
    fn refundable(j: &mut Job, reason: &str) {
        j.state = State::Refundable;
        j.refund_reason = Some(reason.into());
        j.refund_eligible_at = Some(U64(env::block_timestamp()));
    }
    fn supersede_pending(j: &mut Job, now: u64) {
        for c in &mut j.challenges {
            if c.state == ChallengeState::Pending {
                c.state = ChallengeState::Superseded;
                c.resolved_at = Some(U64(now));
            }
        }
    }
    fn expired_challenge(j: &Job, now: u64) -> bool {
        j.challenges
            .iter()
            .any(|c| c.state == ChallengeState::Pending && now >= c.resolution_deadline.0)
    }
    fn schedule(&mut self, mut j: Job, recipient: AccountId, refund: bool) -> Promise {
        require!(
            env::prepaid_gas().as_gas() >= Gas::from_tgas(100).as_gas(),
            "Attach at least 100 Tgas"
        );
        require!(
            recipient != self.verifier && recipient != env::current_account_id(),
            "Invalid beneficiary"
        );
        let storage_locked = env::storage_byte_cost()
            .as_yoctonear()
            .checked_mul(env::storage_usage() as u128)
            .expect("Storage cost overflow");
        require!(
            env::account_balance()
                .as_yoctonear()
                .saturating_sub(storage_locked)
                >= j.escrow.0,
            "Insufficient liquid contract balance"
        );
        j.transfer_attempt = U64(j
            .transfer_attempt
            .0
            .checked_add(1)
            .expect("Transfer attempt overflow"));
        j.state = if refund {
            State::RefundPending
        } else {
            State::PayoutPending
        };
        self.unpaid -= j.escrow.0;
        self.pending += j.escrow.0;
        let id = j.id;
        let attempt = j.transfer_attempt;
        let amount = j.escrow.0;
        self.save(j);
        Promise::new(recipient)
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .with_unused_gas_weight(0)
                    .on_transfer(id, attempt),
            )
    }
}

#[cfg(test)]
mod tests;
