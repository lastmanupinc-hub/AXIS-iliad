import { Router, createApp } from "./router.js";
import {
  handleCreateSnapshot,
  handleGetSnapshot,
  handleGetContext,
  handleGetGeneratedFiles,
  handleGetGeneratedFile,
  handleSearchExport,
  handleSkillsGenerate,
  handleDebugAnalyze,
  handleFrontendAudit,
  handleSeoAnalyze,
  handleOptimizationAnalyze,
  handleHealthCheck,
} from "./handlers.js";

const router = new Router();

// Health
router.get("/health", handleHealthCheck);

// Snapshot endpoints (per axis_all_tools.yaml api_architecture)
router.post("/v1/snapshots", handleCreateSnapshot);
router.get("/v1/snapshots/:snapshot_id", handleGetSnapshot);

// Project context endpoints
router.get("/v1/projects/:project_id/context", handleGetContext);
router.get("/v1/projects/:project_id/generated-files", handleGetGeneratedFiles);
router.get("/v1/projects/:project_id/generated-files/:file_path", handleGetGeneratedFile);

// Program endpoints (per axis_master_blueprint.yaml api_architecture)
router.post("/v1/search/export", handleSearchExport);
router.post("/v1/skills/generate", handleSkillsGenerate);
router.post("/v1/debug/analyze", handleDebugAnalyze);
router.post("/v1/frontend/audit", handleFrontendAudit);
router.post("/v1/seo/analyze", handleSeoAnalyze);
router.post("/v1/optimization/analyze", handleOptimizationAnalyze);

const port = parseInt(process.env.PORT ?? "4000", 10);
createApp(router, port);
