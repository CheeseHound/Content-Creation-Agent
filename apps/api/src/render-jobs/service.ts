import { trackProductAnalyticsEventBestEffort } from "../analytics/product-events";
import { buildRenderIntentFingerprint, normalizedPlatforms, planRenderWorkflow } from "./contract";
import type {
  CreateRenderJobBody,
  CreateRenderJobDependencies,
  CreateRenderJobResult,
  RenderEditBriefReference,
  RenderJobRecord,
  RenderJobReadModel,
  RenderOutputAsset,
  RenderWorkflowPlan,
} from "./types";
import { validateRenderEditBriefReference } from "./validation";

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

export class RenderJobActiveEditBriefRejectedError extends Error {
  readonly details: ReturnType<typeof validateRenderEditBriefReference>;

  constructor(details: ReturnType<typeof validateRenderEditBriefReference>) {
    super("Active edit brief settings are invalid.");
    this.name = "RenderJobActiveEditBriefRejectedError";
    this.details = details;
  }
}

export async function createRenderJob(
  request: CreateRenderJobBody,
  dependencies: CreateRenderJobDependencies,
): Promise<CreateRenderJobResult> {
  const resolvedRequest = await resolveEditBriefForRender(request, dependencies);
  const [subscription, usage] = await Promise.all([
    dependencies.repository.getWorkspaceSubscription(resolvedRequest.workspaceId),
    dependencies.repository.getUsageSnapshot(resolvedRequest.workspaceId),
  ]);
  const plan = planRenderWorkflow({
    request: resolvedRequest,
    tier: subscription.tier,
    usage,
  });

  if (!plan.accepted || !plan.queueJob) {
    throw new RenderJobPlanRejectedError(plan);
  }

  const renderJob: RenderJobRecord = {
    id: buildRenderJobId(resolvedRequest),
    workspaceId: resolvedRequest.workspaceId,
    projectId: resolvedRequest.projectId,
    userId: resolvedRequest.userId,
    sourceAssetId: resolvedRequest.sourceAssetId,
    status: plan.nextStatus,
    estimatedRenderMinutes: plan.estimatedRenderMinutes,
    storageKeys: plan.storageKeys,
    queueJob: plan.queueJob,
  };
  const createdRenderJob = await dependencies.repository.createRenderJob(renderJob);

  await dependencies.queue.enqueue(plan.queueJob);
  await trackProductAnalyticsEventBestEffort({
    sink: dependencies.analyticsSink,
    eventName: "render_job_created",
    workspaceId: createdRenderJob.workspaceId,
    projectId: createdRenderJob.projectId,
    userId: createdRenderJob.userId,
    sourceAssetId: createdRenderJob.sourceAssetId,
    renderJobId: createdRenderJob.id,
    occurredAt: dependencies.now?.() ?? new Date(),
    properties: {
      activeRenderJobs: usage.activeRenderJobs,
      clipCount: resolvedRequest.clipCount,
      estimatedRenderMinutes: createdRenderJob.estimatedRenderMinutes,
      hasEditBrief: resolvedRequest.editBrief !== undefined,
      platformCount: normalizedPlatforms(resolvedRequest.platforms).length,
      status: createdRenderJob.status,
      templateVariant: resolvedRequest.templateVariant,
      tier: subscription.tier,
    },
  });

  return {
    renderJob: createdRenderJob,
    queueJob: plan.queueJob,
  };
}

async function resolveEditBriefForRender(
  request: CreateRenderJobBody,
  dependencies: CreateRenderJobDependencies,
): Promise<CreateRenderJobBody> {
  if (request.editBrief) {
    validateResolvedEditBrief(request.editBrief);
    return request;
  }

  const activeEditBrief = await dependencies.activeEditBriefRepository?.getActiveEditBrief({
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    sourceAssetId: request.sourceAssetId,
  });

  if (!activeEditBrief) {
    return request;
  }

  const editBrief: RenderEditBriefReference = {
    id: activeEditBrief.id,
    versionId: activeEditBrief.versionId,
    versionNumber: activeEditBrief.versionNumber,
    settings: activeEditBrief.settings,
  };

  validateResolvedEditBrief(editBrief);

  return {
    ...request,
    editBrief,
  };
}

function validateResolvedEditBrief(editBrief: RenderEditBriefReference): void {
  const details = validateRenderEditBriefReference(editBrief);

  if (details.length > 0) {
    throw new RenderJobActiveEditBriefRejectedError(details);
  }
}

export async function getRenderJobById(
  id: string,
  dependencies: CreateRenderJobDependencies,
): Promise<RenderJobReadModel | undefined> {
  const renderJob = await dependencies.repository.getRenderJobById(id);

  if (!renderJob) {
    return undefined;
  }

  const outputs = await buildSignedOutputs(renderJob, dependencies);

  if (outputs.length > 0) {
    await trackProductAnalyticsEventBestEffort({
      sink: dependencies.analyticsSink,
      eventName: "output_downloaded",
      workspaceId: renderJob.workspaceId,
      projectId: renderJob.projectId,
      userId: renderJob.userId,
      sourceAssetId: renderJob.sourceAssetId,
      renderJobId: renderJob.id,
      occurredAt: dependencies.now?.() ?? new Date(),
      properties: {
        outputCount: outputs.length,
        totalDurationSeconds: outputs.reduce(
          (sum, output) => sum + (output.durationSeconds ?? 0),
          0,
        ),
        totalSizeBytes: outputs.reduce(
          (sum, output) => sum + (output.sizeBytes ?? 0),
          0,
        ),
      },
    });
  }

  return {
    ...renderJob,
    outputs,
  };
}

function buildRenderJobId(request: CreateRenderJobBody): string {
  const platformSegment = normalizedPlatforms(request.platforms).map(slugifyIdSegment).join("_");
  const templateSegment = slugifyIdSegment(request.templateVariant);
  const renderIntentSegment = buildRenderIntentFingerprint(request);

  return [
    "render_job",
    request.workspaceId,
    request.projectId,
    request.sourceAssetId,
    String(request.clipCount),
    platformSegment,
    templateSegment,
    renderIntentSegment,
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
