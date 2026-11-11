import type { ChainView } from './workflow';

export const taskType = 'Data Cleaning (CSV)';
export const taskTypes = {
  csv: {
    title: taskType, format: 'csv', artifact: 'cleaned CSV',
    description: 'Clean a CSV using explicit rules for headers, whitespace, empty rows, missing values, and duplicates.',
    verification: 'A separate deterministic check rebuilds the expected CSV from the input and acceptance criteria.',
  },
  json_transform: {
    title: 'JSON Transformation', format: 'json', artifact: 'transformed JSON',
    description: 'Rename, select, remove, or filter fields and records, normalize strings, and fill missing values.',
    verification: 'A separate record-by-record check rebuilds the expected JSON and compares canonical content.',
    rulesExample: '{"normalize_strings":{"name":"trim_lower"},"fill_missing":{"team":"unassigned"}}',
    rulesHelp: 'Use rename_fields, filter_records (field, operator eq or ne, and value), normalize_strings (trim, lower, upper, or trim_lower), fill_missing, remove_fields, or select_fields.',
  },
  data_quality_audit: {
    title: 'Data Quality Audit', format: 'json', artifact: 'JSON audit report',
    description: 'Audit records for missing values, duplicate IDs, invalid types, disallowed values, and out-of-range numbers.',
    verification: 'A separate check reproduces the audit findings. A verified report can correctly identify violations.',
    rulesExample: '{"required_values":["id","name"],"duplicate_identifiers":"id","numeric_ranges":{"score":{"min":0,"max":100}}}',
    rulesHelp: 'Use required_values, duplicate_identifiers, field_types, allowed_values, or numeric_ranges with inclusive min and max bounds.',
  },
} as const;
export type TaskType = keyof typeof taskTypes;

export const workflowSteps = [
  ['Define the work', 'Choose a dataset and set the cleaning rules that determine acceptance.'],
  ['Run the AI worker', 'Ollama plans the work and the local worker applies the supported operations.'],
  ['Verify the deliverable', 'A separate deterministic verifier reproduces the expected output and checks the artifact.'],
  ['Challenge defective work', 'Use the first mismatch as reproducible evidence for review.'],
  ['Settle escrow', 'The historical CSV demo shows worker payout and customer refund on NEAR testnet.'],
] as const;

export const historicalOutcomes = {
  '1': { title: 'Worker payout', description: 'Verified work led to a finalized worker payout.', state: 'Paid', method: 'settle_job' },
  '2': { title: 'Customer refund', description: 'An upheld challenge led to a finalized customer refund.', state: 'Refunded', method: 'refund_job' },
} as const;
export type HistoricalJobId = keyof typeof historicalOutcomes;

export function finalizedOutcome(id: HistoricalJobId, view?: ChainView) {
  const expected = historicalOutcomes[id];
  if (view?.error || !view?.block || view.job?.id !== id || view.job.state !== expected.state) return null;
  return view.transactions.find(tx => tx.status === 'finalized' && tx.intent.method === expected.method &&
    tx.hash && tx.explorer && tx.result?.transfer_receipt && tx.result.callback_receipt &&
    tx.intent.beneficiary?.amount === '10000000000000000000000') ?? null;
}
