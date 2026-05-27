import type {
  AnalyticsProperties,
  AnalyticsValue,
  ProductAnalyticsEventName,
  ProductAnalyticsSink,
  TrackProductAnalyticsEventInput,
} from "./types";

export const PRODUCT_ANALYTICS_EVENTS = [
  "upload_presigned",
  "source_uploaded",
  "edit_brief_created",
  "decision_list_created",
  "render_job_created",
  "render_started",
  "render_ready",
  "render_failed",
  "output_downloaded",
  "checkout_started",
  "subscription_updated",
] as const satisfies readonly ProductAnalyticsEventName[];

const SENSITIVE_PROPERTY_PATTERN =
  /(api[_-]?key|chat[_-]?message|credential|customer[_-]?media|media[_-]?contents|password|prompt|raw[_-]?media|secret|storage[_-]?key|token|transcript)/i;
const SENSITIVE_TEXT_PATTERN =
  /\b(api[_ -]?key|secret[_ -]?access[_ -]?key|secret|password|token)\b|sk-[a-z0-9_-]{8,}/i;

export async function trackProductAnalyticsEvent(
  input: TrackProductAnalyticsEventInput,
): Promise<void> {
  const eventName = requireProductAnalyticsEventName(input.eventName);

  await input.sink.track({
    eventName,
    workspaceId: input.workspaceId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.sourceAssetId ? { sourceAssetId: input.sourceAssetId } : {}),
    ...(input.editBriefId ? { editBriefId: input.editBriefId } : {}),
    ...(input.decisionListId ? { decisionListId: input.decisionListId } : {}),
    ...(input.renderJobId ? { renderJobId: input.renderJobId } : {}),
    occurredAt: input.occurredAt.toISOString(),
    properties: sanitizeAnalyticsProperties(input.properties ?? {}),
  });
}

export async function trackProductAnalyticsEventBestEffort(
  input: Omit<TrackProductAnalyticsEventInput, "sink"> & {
    sink?: ProductAnalyticsSink;
  },
): Promise<void> {
  if (!input.sink) {
    return;
  }

  try {
    await trackProductAnalyticsEvent({
      ...input,
      sink: input.sink,
    });
  } catch (_error) {
    return;
  }
}

export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown>,
): AnalyticsProperties {
  const entries = Object.entries(properties)
    .filter(([key, value]) => !SENSITIVE_PROPERTY_PATTERN.test(key) && value !== undefined)
    .map(([key, value]) => [key, sanitizeAnalyticsValue(value)] as const)
    .filter((entry): entry is readonly [string, AnalyticsValue] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return Object.fromEntries(entries);
}

function sanitizeAnalyticsValue(value: unknown): AnalyticsValue | undefined {
  if (typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string" && SENSITIVE_TEXT_PATTERN.test(value)) {
      return undefined;
    }

    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    const values = value
      .map((entry) => sanitizeAnalyticsValue(entry))
      .filter((entry): entry is AnalyticsValue => entry !== undefined);

    return values;
  }

  if (isPlainObject(value)) {
    return sanitizeAnalyticsProperties(value);
  }

  return undefined;
}

function requireProductAnalyticsEventName(value: string): ProductAnalyticsEventName {
  if (PRODUCT_ANALYTICS_EVENTS.includes(value as ProductAnalyticsEventName)) {
    return value as ProductAnalyticsEventName;
  }

  throw new Error(`unsupported product analytics event: ${value}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
}
