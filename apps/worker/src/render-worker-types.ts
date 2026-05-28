import type { QueueJobPayload, RenderOutputManifest } from "./payload";
import type { WorkerAnalyticsSink } from "./analytics";

export interface HyperframesWorkerRuntime {
  chromeExecutablePath: string;
  ffmpegPath: string;
  hyperframesCommand: string;
}

export interface RenderWorkerClaim {
  renderJobId: string;
  alreadyReady?: boolean;
}

export interface RenderWorkerRepository {
  markRendering(
    payload: QueueJobPayload,
    metadata: { workspaceManifestPath: string },
  ): Promise<RenderWorkerClaim>;
  markReady(claim: RenderWorkerClaim, outputManifest: RenderOutputManifest): Promise<void>;
  markFailed(
    payload: QueueJobPayload,
    failure: { code: string; message: string },
  ): Promise<void>;
}

export interface RenderWorkerAnalyticsDependencies {
  analyticsSink?: WorkerAnalyticsSink;
  now?: () => Date;
}

export type HyperframesRenderResult =
  | {
    status: "ready";
    renderJobId: string;
    workspaceManifestPath: string;
  }
  | {
    status: "skipped";
    renderJobId: string;
    reason: "already_ready";
  }
  | {
    status: "failure";
    errorMessage: string;
    workspaceManifestPath?: string;
  };
