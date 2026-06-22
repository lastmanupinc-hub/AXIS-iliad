export type { SnapshotInput, SnapshotRecord, SnapshotManifest, FileEntry, InputMethod, SnapshotStatus } from "./types.js";
export {
  createSnapshot,
  getSnapshot,
  updateSnapshotStatus,
  getProjectSnapshots,
  getProjectOwner,
  deleteSnapshot,
  deleteProject,
  saveContextMap,
  getContextMap,
  saveRepoProfile,
  getRepoProfile,
  saveGeneratorResult,
  getGeneratorResult,
} from "./store.js";
export { getDb, peekDb, openMemoryDb, closeDb, runMigrations, getSchemaVersion, walCheckpoint, vacuum, integrityCheck, getDbStats, purgeStaleData, runMaintenance } from "./db.js";
export type { DbMaintenanceResult } from "./db.js";

// Search
export type { SearchIndexEntry, SearchResult, CodeSymbol, SymbolSearchResult, SymbolType } from "./search-store.js";
export { indexSnapshotContent, searchSnapshotContent, clearSearchIndex, getSearchIndexStats, indexSymbols, searchSymbols, clearSymbols, getSymbolStats, extractSymbols } from "./search-store.js";
export type { GitHubFetchResult, ParsedGitHubUrl } from "./github.js";
export { parseGitHubUrl, fetchGitHubRepo } from "./github.js";

// Billing
export type { Account, ApiKey, BillingTier, ProgramEntitlement, UsageRecord, UsageSummary, TierLimits, ProgramName, PersistenceOp, PersistenceCreditRecord, PersistencePackId } from "./billing-types.js";
export type { QuotaCheck, SystemStats, AccountSummary, RecentActivity, ApiEndpointUsage, ApiStatusUsage, AccountApiAnalyticsSummary } from "./billing-store.js";
export { TIER_LIMITS, ALL_PROGRAMS, PERSISTENCE_CREDIT_COSTS, PERSISTENCE_CREDIT_PACKS, PERSISTENCE_MIN_TIER, SUITE_MONTHLY_PERSISTENCE_CREDITS } from "./billing-types.js";
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
export type { MeterResult } from "./persistence-metering.js";
export {
  getPersistenceBalance,
  canUsePersistence,
  addPersistenceCredits,
  applySuiteMonthlyGrant,
  meterPersistenceOp,
  getPersistenceLedger,
} from "./persistence-metering.js";

// OAuth
export type { GitHubTokenResponse, GitHubUser } from "./oauth-store.js";
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
} from "./usage-credit-metering.js";
export {
  getIdempotentResult,
  saveIdempotentResult,
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
