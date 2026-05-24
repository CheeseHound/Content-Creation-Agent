import { normalizedPlatforms, planRenderWorkflow } from "./contract";
import type {
  CreateRenderJobBody,
  CreateRenderJobDependencies,
  CreateRenderJobResult,
  RenderJobRecord,
  RenderJobReadModel,
  RenderOutputAsset,
  RenderWorkflowPlan,
} from "./types";

export const DEFAULT_OUTPUT_DOWNLOAD_TTL_SECONDS = 15 * 60;

export class RenderJobPlanRejectedError extends Error {
  readonly code: "quota_exceeded" | "plan_limit_exceeded";
  readonly plan: RenderWorkflowPlan;

  constructor(plan: RenderWorkflowPlan) {
    super(plan.reason ?? "render job request rejected");
    this.name = "RenderJobPlanRejectedError";
    this.code = plan.rejectionCode ?? "quota_exceeded";
    this.plan = plan;
  }
}

export async function createRenderJob(
  request: CreateRenderJobBody,
  dependencies: CreateRenderJobDependencies,
): Promise<CreateRenderJobResult> {
  const [subscription, usage] = await Promise.all([
    dependencies.repository.getWorkspaceSubscription(request.workspaceId),
    dependencies.repository.getUsageSnapshot(request.workspaceId),
  ]);
  const plan = planRenderWorkflow({
    request,
    tier: subscription.tier,
    usage,
  });

  if (!plan.accepted || !plan.queueJob) {
    throw new RenderJobPlanRejectedError(plan);
  }

  const renderJob: RenderJobRecord = {
    id: buildRenderJobId(request),
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    userId: request.userId,
    sourceAssetId: request.sourceAssetId,
    status: plan.nextStatus,
    estimatedRenderMinutes: plan.estimatedRenderMinutes,
    storageKeys: plan.storageKeys,
    queueJob: plan.queueJob,
  };
  const createdRenderJob = await dependencies.repository.createRenderJob(renderJob);

  await dependencies.queue.enqueue(plan.queueJob);

  return {
    renderJob: createdRenderJob,
    queueJob: plan.queueJob,
  };
}

export async function getRenderJobById(
  id: string,
  dependencies: CreateRenderJobDependencies,
): Promise<RenderJobReadModel | undefined> {
  const renderJob = await dependencies.repository.getRenderJobById(id);

  if (!renderJob) {
    return undefined;
  }

  return {
    ...renderJob,
    outputs: await buildSignedOutputs(renderJob, dependencies),
  };
}

function buildRenderJobId(request: CreateRenderJobBody): string {
  const platformSegment = normalizedPlatforms(request.platforms).map(slugifyIdSegment).join("_");

  return [
    "render_job",
    request.workspaceId,
    request.projectId,
    request.sourceAssetId,
    String(request.clipCount),
    platformSegment,
  ].join("_");
}

function slugifyIdSegment(value: string): string {
  const slug = value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "platform";
}

async function buildSignedOutputs(
  renderJob: RenderJobRecord,
  dependencies: CreateRenderJobDependencies,
) {
  if (renderJob.status !== "ready" || !renderJob.outputManifest) {
    return [];
  }

  const outputs = renderJob.outputManifest.outputs.map((output) =>
    validateOutputAsset(output, renderJob.storageKeys.render_output_prefix),
  );

  if (outputs.length === 0) {
    return [];
  }

  const outputSigner = dependencies.outputSigner;

  if (!outputSigner) {
    throw new Error("output signer is required for ready render job outputs");
  }

  const ttlSeconds = dependencies.outputDownloadTtlSeconds ?? DEFAULT_OUTPUT_DOWNLOAD_TTL_SECONDS;
  const expiresAt = new Date((dependencies.now?.() ?? new Date()).getTime() + ttlSeconds * 1000);

  return Promise.all(outputs.map(async (output) => ({
    ...output,
    download: await outputSigner.presignDownload({
      key: output.storageKey,
      responseContentType: output.contentType,
      responseContentDisposition: `attachment; filename="${sanitizeContentDispositionFilename(output.filename)}"`,
      expiresAt,
    }),
  })));
}

function validateOutputAsset(
  output: RenderOutputAsset,
  renderOutputPrefix: string,
): RenderOutputAsset {
  if (!output.storageKey.startsWith(renderOutputPrefix)) {
    throw new Error("render output key must stay under render output prefix");
  }

  return output;
}

function sanitizeContentDispositionFilename(filename: string): string {
  const sanitized = filename.replace(/[\r\n"\\]/g, "_").trim();
  return sanitized.length > 0 ? sanitized : "download";
}
