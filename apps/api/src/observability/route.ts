import { ok, type HttpResponse } from "../api-response";
import { getLiveness, getReadiness } from "./service";
import type {
  LivenessReport,
  ObservabilityDependencies,
  ReadinessReport,
} from "./types";

export type HealthzHandler = () => HttpResponse<LivenessReport>;
export type ReadyzHandler = () => Promise<HttpResponse<ReadinessReport>>;

export function createHealthzHandler(
  dependencies: ObservabilityDependencies = {},
): HealthzHandler {
  return () => ok(getLiveness(dependencies));
}

export function createReadyzHandler(dependencies: ObservabilityDependencies): ReadyzHandler {
  return async () => {
    const report = await getReadiness(dependencies);

    return {
      ...ok(report),
      status: report.status === "ok" ? 200 : 503,
    };
  };
}
