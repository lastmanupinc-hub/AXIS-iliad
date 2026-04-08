export type { SnapshotInput, SnapshotRecord, SnapshotManifest, FileEntry, InputMethod, SnapshotStatus } from "./types.js";
export {
  createSnapshot,
  getSnapshot,
  updateSnapshotStatus,
  getProjectSnapshots,
  deleteSnapshot,
  deleteProject,
  saveContextMap,
  getContextMap,
  saveRepoProfile,
  getRepoProfile,
  saveGeneratorResult,
  getGeneratorResult,
} from "./store.js";
export { getDb, openMemoryDb, closeDb, runMigrations, getSchemaVersion, walCheckpoint, vacuum, integrityCheck, getDbStats, purgeStaleData, runMaintenance } from "./db.js";
export type { DbMaintenanceResult } from "./db.js";

// Search
export type { SearchIndexEntry, SearchResult } from "./search-store.js";
export { indexSnapshotContent, searchSnapshotContent, clearSearchIndex, getSearchIndexStats } from "./search-store.js";
export type { GitHubFetchResult, ParsedGitHubUrl } from "./github.js";
export { parseGitHubUrl, fetchGitHubRepo } from "./github.js";

// Billing
export type { Account, ApiKey, BillingTier, ProgramEntitlement, UsageRecord, UsageSummary, TierLimits, ProgramName } from "./billing-types.js";
export type { QuotaCheck, SystemStats, AccountSummary, RecentActivity } from "./billing-store.js";
export { TIER_LIMITS, ALL_PROGRAMS } from "./billing-types.js";
export {
  createAccount,
  getAccount,
  getAccountByEmail,
  updateAccountTier,
  createApiKey,
  resolveApiKey,
  revokeApiKey,
  listApiKeys,
  enableProgram,
  disableProgram,
  getEntitlements,
  isProgramEnabled,
  recordUsage,
  getUsageSummary,
  getMonthlySnapshotCount,
  getProjectCount,
  checkQuota,
  getSystemStats,
  listAllAccounts,
  getRecentActivity,
} from "./billing-store.js";

// Funnel & Seats
export type { FunnelStage, FunnelEventType, FunnelEvent, SeatRole, Seat, PlanFeature, PlanDefinition, UpgradePrompt } from "./funnel-types.js";
export { SEAT_LIMITS, PLAN_CATALOG, PLAN_FEATURES, ACTIVATION_THRESHOLD, ENGAGEMENT_THRESHOLD, CHURN_RISK_DAYS } from "./funnel-types.js";
export type { FunnelMetrics } from "./funnel-store.js";
export {
  inviteSeat,
  acceptSeat,
  revokeSeat,
  getSeat,
  getActiveSeats,
  getAllSeats,
  getSeatByEmail,
  getSeatCount,
  trackEvent,
  getAccountEvents,
  getLatestEvent,
  getEventsByType,
  resolveStage,
  generateUpgradePrompt,
  getFunnelMetrics,
} from "./funnel-store.js";

// Webhooks
export type { WebhookEventType, Webhook, WebhookDelivery, RetryCandidate } from "./webhook-store.js";
export { VALID_WEBHOOK_EVENTS, MAX_RETRY_ATTEMPTS, RETRY_BACKOFF_BASE_MS } from "./webhook-store.js";
export {
  createWebhook,
  listWebhooks,
  getWebhook,
  deleteWebhook,
  updateWebhookActive,
  getActiveWebhooksForEvent,
  recordDelivery,
  getDeliveries,
  signPayload,
  dispatchWebhookEvent,
  computeNextRetryAt,
  getPendingRetries,
  clearRetrySchedule,
  getDeadLetters,
  processRetryQueue,
} from "./webhook-store.js";

// Generation Versions
export type { GenerationVersion, VersionFile, FileDiff, VersionDiff } from "./version-store.js";
export {
  saveGenerationVersion,
  listGenerationVersions,
  getGenerationVersion,
  diffGenerationVersions,
} from "./version-store.js";

// GitHub Token Management
export type { GitHubToken } from "./github-token-store.js";
export {
  saveGitHubToken,
  getGitHubTokens,
  getGitHubTokenDecrypted,
  deleteGitHubToken,
  markTokenUsed,
  markTokenInvalid,
  markTokenValidated,
} from "./github-token-store.js";

// Tier Audit
export type { TierChange, ProrationResult } from "./tier-audit.js";
export {
  logTierChange,
  getTierHistory,
  getLastTierChange,
  calculateProration,
} from "./tier-audit.js";

// OAuth
export type { GitHubTokenResponse, GitHubUser } from "./oauth-store.js";
export {
  createOAuthState,
  consumeOAuthState,
  getGitHubAuthUrl,
  exchangeGitHubCode,
  getGitHubUser,
  getAccountByGitHubId,
  linkGitHubId,
  upsertAccountByGitHub,
} from "./oauth-store.js";

// Email Notifications
export type { EmailTemplate, EmailMessage, EmailDelivery, EmailProvider } from "./email-store.js";
export {
  renderTemplate,
  recordEmailDelivery,
  getEmailDeliveries,
  getEmailDelivery,
  setEmailProvider,
  getEmailProvider,
  consoleEmailProvider,
  sendEmail,
  sendSeatInvitation,
  sendWelcomeEmail,
  sendUpgradeConfirmation,
  sendUsageAlert,
  sendApiKeyNotification,
} from "./email-store.js";
