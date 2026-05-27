import { trackProductAnalyticsEventBestEffort } from "../analytics/product-events";
import {
  buildEditBriefId,
  buildEditBriefIdempotencyKey,
  buildEditBriefSettings,
  buildEditBriefVersionId,
} from "./contract";
import type {
  CreateEditBriefBody,
  CreateEditBriefDependencies,
  CreateEditBriefResult,
  EditBriefVersionRecord,
} from "./types";

export async function createEditBrief(
  request: CreateEditBriefBody,
  dependencies: CreateEditBriefDependencies,
): Promise<CreateEditBriefResult> {
  const settings = buildEditBriefSettings(request);
  const editBriefId = buildEditBriefId(request);
  const record: EditBriefVersionRecord = {
    id: buildEditBriefVersionId({ editBriefId, settings }),
    editBriefId,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    userId: request.userId,
    ...(request.sourceAssetId ? { sourceAssetId: request.sourceAssetId } : {}),
    versionNumber: 0,
    settings,
    idempotencyKey: buildEditBriefIdempotencyKey({ editBriefId, settings }),
  };

  const editBriefVersion = await dependencies.editBriefRepository.createEditBriefVersion(record);
  await trackProductAnalyticsEventBestEffort({
    sink: dependencies.analyticsSink,
    eventName: "edit_brief_created",
    workspaceId: editBriefVersion.workspaceId,
    projectId: editBriefVersion.projectId,
    userId: editBriefVersion.userId,
    sourceAssetId: editBriefVersion.sourceAssetId,
    editBriefId: editBriefVersion.editBriefId,
    occurredAt: dependencies.now?.() ?? new Date(),
    properties: {
      captionPreset: editBriefVersion.settings.captionStyle.preset,
      cropStrategy: editBriefVersion.settings.cropStrategy,
      pacing: editBriefVersion.settings.pacing,
      targetPlatformCount: editBriefVersion.settings.targetPlatforms.length,
      tone: editBriefVersion.settings.tone,
      versionNumber: editBriefVersion.versionNumber,
    },
  });

  return {
    editBrief: {
      id: editBriefVersion.editBriefId,
      versionId: editBriefVersion.id,
      workspaceId: editBriefVersion.workspaceId,
      projectId: editBriefVersion.projectId,
      userId: editBriefVersion.userId,
      ...(editBriefVersion.sourceAssetId ? { sourceAssetId: editBriefVersion.sourceAssetId } : {}),
      versionNumber: editBriefVersion.versionNumber,
      settings: editBriefVersion.settings,
    },
  };
}
