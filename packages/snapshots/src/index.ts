export type { SnapshotInput, SnapshotRecord, SnapshotManifest, FileEntry, InputMethod, SnapshotStatus } from "./types.js";
export type { ProjectListEntry } from "./store.js";
export {
  createSnapshot,
  getSnapshot,
  updateSnapshotStatus,
  getProjectSnapshots,
  getProjectOwner,
  listProjectsByAccount,
  listProjectsWithLatestSnapshot,
  deleteSnapshot,
  deleteProject,
  saveContextMap,
  getContextMap,
  saveRepoProfile,
  getRepoProfile,
  saveGeneratorResult,
  getGeneratorResult,
} from "./store.js";
// Postgres (Neon) async data core — the migration target. Stores now run on `sql`;
// callers init with runPgMigrations() and shut down with closePool(). See NEON_MIGRATION_PLAN.md.
export { sql, getPool, peekPool, closePool, pgPlaceholders } from "./pg.js";
export { runPgMigrations, getPgSchemaVersion, dropAllPgTables, PG_LATEST_VERSION } from "./pg-schema.js";
export { resetTestDb, closeTestDb } from "./pg-test.js";
export { getPgDbStats, pgIntegrityCheck, runPgMaintenance } from "./pg-maintenance.js";

// Search
export type { SearchIndexEntry, SearchResult, CodeSymbol, SymbolSearchResult, SymbolType } from "./search-store.js";
export { indexSnapshotContent, searchSnapshotContent, clearSearchIndex, getSearchIndexStats, indexSymbols, searchSymbols, clearSymbols, getSymbolStats, extractSymbols } from "./search-store.js";
export type { GitHubFetchResult, ParsedGitHubUrl } from "./github.js";
export { parseGitHubUrl, fetchGitHubRepo } from "./github.js";

// Billing
export type { Account, ApiKey, BillingTier, ProgramEntitlement, UsageRecord, UsageSummary, TierLimits, ProgramName, PersistenceOp, PersistenceCreditRecord, PersistencePackId } from "./billing-types.js";
export type { QuotaCheck, SystemStats, AccountSummary, RecentActivity, ApiEndpointUsage, ApiStatusUsage, AccountApiAnalyticsSummary, UsageDayBucket } from "./billing-store.js";
export { TIER_LIMITS, ALL_PROGRAMS, PERSISTENCE_CREDIT_COSTS, PERSISTENCE_CREDIT_PACKS, PERSISTENCE_MIN_TIER, SUITE_MONTHLY_PERSISTENCE_CREDITS } from "./billing-types.js";
export {
  createAccount,
  getAccount,
  getAccountByEmail,
  updateAccountProfile,
  deleteAccount,
  updateAccountTier,
  updateAccountTierIfCurrent,
  getAccountPaidPlanId,
  updateAccountPaidPlanId,
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
  getUsageByDay,
  getMonthlySnapshotCount,
  getProjectCount,
  checkQuota,
  getSystemStats,
  listAllAccounts,
  getRecentActivity,
  recordApiCall,
  getApiCallSummary,
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

// Growth & revenue snapshot (data source for the ME-01 readiness score)
export type { GrowthSnapshot } from "./growth-store.js";
export { getGrowthSnapshot } from "./growth-store.js";

// Payment receipts — settled H1 cash payments (WO-19 revenue-mrr-tracker)
export type { PaymentReceipt, PaymentProvider, SettledRevenue } from "./payment-receipts-store.js";
export { recordSettledPayment, getSettledRevenue } from "./payment-receipts-store.js";

// Payment funnel — x402 onboarding program Phase 0 (challenges issued, $0 probe settlements)
export type { PaymentFunnelEventKind, PaymentFunnelEventInput, PaymentFunnelStats } from "./payment-funnel-store.js";
export { recordPaymentFunnelEvent, getPaymentFunnelStats } from "./payment-funnel-store.js";

// Compensation ledger — WO-20 phase 3 (H2): money moved, work didn't.
export type { CompensationEntry, CompensationReason, CompensationStatus, RecordCompensationInput } from "./compensation-store.js";
export {
  recordCompensationOwed,
  claimCompensationForCredit,
  resolveCompensation,
  getCompensationSummary,
  getTotalCompensationOwed,
  listOwedCompensation,
  listOwedCompensationForAccount,
} from "./compensation-store.js";

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

// Persistence metering (add-on, metered on top of paid/suite)
export type { MeterResult, PersistenceSpendDayBucket } from "./persistence-metering.js";
export {
  getPersistenceBalance,
  canUsePersistence,
  addPersistenceCredits,
  applySuiteMonthlyGrant,
  meterPersistenceOp,
  getPersistenceLedger,
  getPersistenceSpendByDay,
} from "./persistence-metering.js";

// Project memory
export type { MemoryKind, MemoryEntry } from "./memory-store.js";
export {
  MEMORY_KINDS,
  MEMORY_CONTENT_MAX,
  MEMORY_SOURCE_MAX,
  MEMORY_PROJECT_CAP,
  addMemoryEntry,
  listMemoryEntries,
  countMemoryEntries,
  getMemoryProject,
} from "./memory-store.js";

// OAuth
export type { GitHubTokenResponse, GitHubUser, GoogleTokenResponse, GoogleUser } from "./oauth-store.js";
export {
  createOAuthState,
  consumeOAuthState,
  createAuthCode,
  consumeAuthCode,
  getGitHubAuthUrl,
  exchangeGitHubCode,
  getGitHubUser,
  getAccountByGitHubId,
  linkGitHubId,
  upsertAccountByGitHub,
  getGoogleAuthUrl,
  exchangeGoogleCode,
  getGoogleUser,
  getAccountByGoogleId,
  linkGoogleId,
  upsertAccountByGoogle,
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

// Disputes (WO-08 dispute-lifecycle) — webhook-ingested DisputeRecords +
// append-only transition ledger. Structural types; the strongly-typed state
// machine lives in @axis/agentic-compliance.
export type { StoredDisputeRecord, StoredDisputeTransition } from "./dispute-store.js";
export {
  upsertDispute,
  getDispute,
  listDisputesByAccount,
  logDisputeTransition,
  listDisputeTransitions,
} from "./dispute-store.js";

// Stripe Payments
export type { StripeSubscriptionStatus, StripeSubscription } from "./stripe-store.js";
export {
  priceToTier,
  priceToPlanId,
  upsertSubscription,
  getSubscription,
  getSubscriptionByAccount,
  getActiveSubscriptionByAccount,
  updateSubscriptionStatus,
  listSubscriptionsByAccount,
  deleteSubscription,
  getActiveSubscriptionTier,
} from "./stripe-store.js";

// Usage credit metering (monthly plan credits + overage)
export type { UsageCreditPlanId, UsageCreditSummary, UsageCreditChargeResult } from "./usage-credit-metering.js";
export {
  creditsFromUsdCents,
  getUsageCreditSummary,
  previewUsageCredits,
  consumeUsageCredits,
  grantUsageCredits,
} from "./usage-credit-metering.js";

// Marketed pricing constants (single source of truth — WO-01 billing-tiers-4)
export type { MarketedTier, MarketedPlanId } from "./pricing-constants.js";
export { MARKETED_TIERS, OVERAGE_USD_PER_CREDIT, OVERAGE_CENTS_PER_CREDIT, REFERRAL_MAX_REDUCTION_RATE } from "./pricing-constants.js";
export {
  getIdempotentResult,
  claimIdempotencyKey,
  completeIdempotencyKey,
  releaseIdempotencyKey,
  pruneIdempotencyKeys,
} from "./idempotency-store.js";
export type { IdempotentRecord } from "./idempotency-store.js";

// Credit-pack top-ups — one-shot persistence-credit purchases routed through PAI'D.
export type { CreditPackPurchase, CreditPackStatus, CreditPackCatalogEntry } from "./credit-pack-store.js";
export {
  listCreditPackCatalog,
  getCreditPack,
  recordPendingPurchase,
  markPurchaseSucceeded,
  getPurchaseBySession,
  listPurchasesByAccount,
} from "./credit-pack-store.js";

// 24h shared scrape cache (Firecrawl dedup across the network)
export type { CachedScrape, ScrapeCacheStats } from "./scrape-cache-store.js";
export {
  normalizeUrl,
  getCachedScrape,
  putCachedScrape,
  cleanupExpiredScrapes,
  getScrapeCacheStats,
} from "./scrape-cache-store.js";

// Free Firecrawl page pool (100 pages/account/month, scrape + crawl)
export type { FreeScrapeConsumption, FreeScrapePoolStatus } from "./free-scrape-pool-store.js";
export {
  FREE_SCRAPE_POOL_MONTHLY,
  consumeFreeScrapes,
  getFreeScrapePoolStatus,
} from "./free-scrape-pool-store.js";

// Referral System
export type { ReferralCode, ReferralConversion, ReferralCredits, ReferralTokenUsageModifier } from "./referral-store.js";
export {
  REWARD_MILLICENTS,
  MAX_EARNED_MILLICENTS,
  CREDIT_WINDOW_MS,
  createReferralCode,
  lookupReferralCode,
  getReferralCodes,
  recordReferralConversion,
  getReferralConversionCount,
  getReferralCredits,
  getReferralTokenUsageModifier,
  recordPaidCall,
  consumeFreeCall,
  applyReferralDiscount,
  buildIncentivesSummary,
} from "./referral-store.js";

// MCP usage telemetry (persistent per-call tracking)
export type {
  McpUsageInput,
  McpUsageRow,
  McpUsageWindows,
  McpUsageSummary,
  McpNewVsReturning,
} from "./mcp-usage-store.js";
export {
  recordMcpUsage,
  getMcpUsageWindows,
  getMcpUsageSummary,
  getMcpUsageNewVsReturning,
  getRecentMcpUsage,
} from "./mcp-usage-store.js";
