// @axis/revops — the revenue operating system shared by AXIS programs.
//
// Not a CRM: no stage is stored, so no board is maintained. Callers append
// facts; stage and next action are derived on read.
//
// Typical use (PAI'D merchant acquisition):
//
//   import { evaluate, todayQueue, funnel, funnelSummary } from "@axis/revops";
//
//   const queue = todayQueue(records, new Date(), { limit: 10 });
//   for (const item of queue) {
//     console.log(item.next.action, item.prospect.legal_name, item.next.reason);
//   }

export {
  type Stage,
  type TerminalState,
  type PipelineState,
  type RevOpsEvent,
  type RevOpsEventType,
  type Prospect,
  type ProspectFacts,
  type DecisionMaker,
  type NextAction,
  type NextActionKind,
  type SignalKind,
  type SignalPayload,
  type ContactedPayload,
  type RepliedPayload,
  type SnoozedPayload,
  STAGE_ORDER,
  TERMINAL_STATES,
  isTerminal,
  stageRank,
} from "./types.js";

export { deriveState, snoozeExpired, reachedStage, type DerivedState } from "./stages.js";

export {
  nextAction,
  DEFAULT_CADENCE,
  type Cadence,
} from "./next-action.js";

export {
  qualify,
  score,
  HIGH_RISK_VERTICALS,
  type QualifyResult,
  type ScoreResult,
} from "./score.js";

export {
  evaluate,
  funnel,
  funnelSummary,
  todayQueue,
  type ProspectRecord,
  type EvaluatedProspect,
  type FunnelCounts,
} from "./pipeline.js";

export {
  fingerprintPage,
  hasAgeGate,
  detectStackChange,
  type PageSnapshot,
  type FingerprintResult,
} from "./fingerprint.js";

export {
  parseRobots,
  isAllowed,
  ROBOTS_ABSENT,
  type RobotsRules,
  type RobotsDecision,
} from "./robots.js";
