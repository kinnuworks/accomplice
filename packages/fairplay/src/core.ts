// The browser-safe core: everything except the Z3 verifier. No Node APIs, no WebAssembly.
// Use this entry in a web page; use the main entry on a server to verify cases with Z3.
export type * from '@accomplice/protocol';
export { generateCase, MIN_SEATS, type GenerateOptions } from './generate.js';
export { sliceFor, checkReply, publicView } from './slice.js';
export { evaluateTheory, objectionSlip, proofChain, safeLiesForAccomplice, slipFact, type Objection } from './proof.js';
export { describeFact } from './text.js';
export { analyse, worldOf, toIFact, type Analysis } from './logic.js';
