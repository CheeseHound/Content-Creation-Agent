"""Production workflow contracts for short-form content operations.

This module models the SaaS boundary around the existing offline-first agent:
subscription-aware intake, deterministic object storage keys, queue payloads,
and render job lifecycle transitions.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import hashlib
import json
import math
import re
from types import MappingProxyType
from typing import Any, Mapping


DEFAULT_RENDER_QUEUE = "content-ops-render"
WORKFLOW_SCHEMA_VERSION = "content_ops.render_job.v1"


class SubscriptionTier(str, Enum):
    FREE = "free"
    CREATOR = "creator"
    STUDIO = "studio"


class RenderJobStatus(str, Enum):
    CREATED = "created"
    UPLOADED = "uploaded"
    TRANSCRIBING = "transcribing"
    TRANSCRIBED = "transcribed"
    RENDER_QUEUED = "render_queued"
    RENDERING = "rendering"
    READY = "ready"
    FAILED = "failed"
    CANCELED = "canceled"


@dataclass(frozen=True)
class PlanEntitlement:
    tier: SubscriptionTier
    max_active_render_jobs: int
    monthly_render_minutes: int
    max_source_bytes: int
    queue_priority: int
    stripe_lookup_key: str


DEFAULT_ENTITLEMENTS: Mapping[SubscriptionTier, PlanEntitlement] = MappingProxyType(
    {
        SubscriptionTier.FREE: PlanEntitlement(
            tier=SubscriptionTier.FREE,
            max_active_render_jobs=1,
            monthly_render_minutes=30,
            max_source_bytes=500 * 1024 * 1024,
            queue_priority=10,
            stripe_lookup_key="content_ops_free",
        ),
        SubscriptionTier.CREATOR: PlanEntitlement(
            tier=SubscriptionTier.CREATOR,
            max_active_render_jobs=3,
            monthly_render_minutes=200,
            max_source_bytes=2 * 1024 * 1024 * 1024,
            queue_priority=50,
            stripe_lookup_key="content_ops_creator",
        ),
        SubscriptionTier.STUDIO: PlanEntitlement(
            tier=SubscriptionTier.STUDIO,
            max_active_render_jobs=10,
            monthly_render_minutes=1_000,
            max_source_bytes=10 * 1024 * 1024 * 1024,
            queue_priority=100,
            stripe_lookup_key="content_ops_studio",
        ),
    }
)


ALLOWED_RENDER_JOB_TRANSITIONS: Mapping[RenderJobStatus, frozenset[RenderJobStatus]] = MappingProxyType(
    {
        RenderJobStatus.CREATED: frozenset(
            {
                RenderJobStatus.UPLOADED,
                RenderJobStatus.CANCELED,
                RenderJobStatus.FAILED,
            }
        ),
        RenderJobStatus.UPLOADED: frozenset(
            {
                RenderJobStatus.TRANSCRIBING,
                RenderJobStatus.RENDER_QUEUED,
                RenderJobStatus.CANCELED,
                RenderJobStatus.FAILED,
            }
        ),
        RenderJobStatus.TRANSCRIBING: frozenset(
            {
                RenderJobStatus.TRANSCRIBED,
                RenderJobStatus.CANCELED,
                RenderJobStatus.FAILED,
            }
        ),
        RenderJobStatus.TRANSCRIBED: frozenset(
            {
                RenderJobStatus.RENDER_QUEUED,
                RenderJobStatus.CANCELED,
                RenderJobStatus.FAILED,
            }
        ),
        RenderJobStatus.RENDER_QUEUED: frozenset(
            {
                RenderJobStatus.RENDERING,
                RenderJobStatus.CANCELED,
                RenderJobStatus.FAILED,
            }
        ),
        RenderJobStatus.RENDERING: frozenset(
            {
                RenderJobStatus.READY,
                RenderJobStatus.FAILED,
            }
        ),
        RenderJobStatus.READY: frozenset(),
        RenderJobStatus.FAILED: frozenset(),
        RenderJobStatus.CANCELED: frozenset(),
    }
)


@dataclass(frozen=True)
class UsageSnapshot:
    active_render_jobs: int
    rendered_minutes_this_period: int

    def __post_init__(self) -> None:
        if self.active_render_jobs < 0:
            raise ValueError("active_render_jobs must be non-negative")
        if self.rendered_minutes_this_period < 0:
            raise ValueError("rendered_minutes_this_period must be non-negative")


@dataclass(frozen=True)
class RenderWorkflowRequest:
    workspace_id: str
    project_id: str
    user_id: str
    source_asset_id: str
    source_filename: str
    source_size_bytes: int
    duration_seconds: int
    brand_name: str
    audience: str
    clip_count: int
    platforms: tuple[str, ...]
    template_variant: str
    template_parameters: Mapping[str, str | int | float | bool]
    style_options: Mapping[str, str]
    caption_timeline: tuple[Mapping[str, Any], ...]

    def __post_init__(self) -> None:
        _require_text("workspace_id", self.workspace_id)
        _require_text("project_id", self.project_id)
        _require_text("user_id", self.user_id)
        _require_text("source_asset_id", self.source_asset_id)
        _require_text("source_filename", self.source_filename)
        _require_text("brand_name", self.brand_name)
        _require_text("audience", self.audience)
        if self.source_size_bytes < 1:
            raise ValueError("source_size_bytes must be positive")
        if self.duration_seconds < 1:
            raise ValueError("duration_seconds must be positive")
        if not 1 <= self.clip_count <= 25:
            raise ValueError("clip_count must be between 1 and 25")
        if not self.platforms:
            raise ValueError("platforms must include at least one target")
        if any(not platform.strip() for platform in self.platforms):
            raise ValueError("platforms cannot contain blank values")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", self.template_variant.strip()):
            raise ValueError("template_variant must be a safe slug")
        _validate_template_parameters(self.template_parameters)
        _validate_style_options(self.style_options)
        _validate_caption_timeline(self.caption_timeline)

    @property
    def normalized_platforms(self) -> tuple[str, ...]:
        return tuple(sorted({platform.strip().lower() for platform in self.platforms}))


@dataclass(frozen=True)
class MediaStorageKeys:
    raw_source_key: str
    audio_key: str
    transcript_key: str
    render_output_prefix: str

    def to_dict(self) -> dict[str, str]:
        return {
            "source_key": self.raw_source_key,
            "audio_key": self.audio_key,
            "transcript_key": self.transcript_key,
            "render_output_prefix": self.render_output_prefix,
        }


@dataclass(frozen=True)
class QueueJob:
    queue_name: str
    idempotency_key: str
    priority: int
    payload: Mapping[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "queue_name": self.queue_name,
            "idempotency_key": self.idempotency_key,
            "priority": self.priority,
            "payload": dict(self.payload),
        }


@dataclass(frozen=True)
class RenderWorkflowPlan:
    accepted: bool
    reason: str | None
    next_status: RenderJobStatus
    estimated_render_minutes: int
    storage_keys: MediaStorageKeys
    queue_job: QueueJob | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "accepted": self.accepted,
            "reason": self.reason,
            "next_status": self.next_status.value,
            "estimated_render_minutes": self.estimated_render_minutes,
            "storage_keys": self.storage_keys.to_dict(),
            "queue_job": self.queue_job.to_dict() if self.queue_job else None,
        }


def build_storage_keys(
    *,
    workspace_id: str,
    project_id: str,
    source_asset_id: str,
    source_filename: str,
) -> MediaStorageKeys:
    _require_text("workspace_id", workspace_id)
    _require_text("project_id", project_id)
    _require_text("source_asset_id", source_asset_id)
    _require_text("source_filename", source_filename)

    base_prefix = f"workspaces/{workspace_id}/projects/{project_id}"
    safe_filename = _slugify_filename(source_filename)
    return MediaStorageKeys(
        raw_source_key=f"{base_prefix}/uploads/{source_asset_id}/{safe_filename}",
        audio_key=f"{base_prefix}/audio/{source_asset_id}/source.wav",
        transcript_key=f"{base_prefix}/transcripts/{source_asset_id}/transcript.json",
        render_output_prefix=f"{base_prefix}/renders/{source_asset_id}/",
    )


def estimate_render_minutes(request: RenderWorkflowRequest) -> int:
    return math.ceil(request.duration_seconds / 60) * request.clip_count


def plan_render_workflow(
    *,
    request: RenderWorkflowRequest,
    tier: SubscriptionTier,
    usage: UsageSnapshot,
    queue_name: str = DEFAULT_RENDER_QUEUE,
) -> RenderWorkflowPlan:
    entitlement = DEFAULT_ENTITLEMENTS[tier]
    storage_keys = build_storage_keys(
        workspace_id=request.workspace_id,
        project_id=request.project_id,
        source_asset_id=request.source_asset_id,
        source_filename=request.source_filename,
    )
    estimated_render_minutes = estimate_render_minutes(request)

    if request.source_size_bytes > entitlement.max_source_bytes:
        return _rejected_plan(
            reason="source asset exceeds plan upload limit",
            estimated_render_minutes=estimated_render_minutes,
            storage_keys=storage_keys,
        )

    if usage.active_render_jobs >= entitlement.max_active_render_jobs:
        return _rejected_plan(
            reason="active render job limit reached",
            estimated_render_minutes=estimated_render_minutes,
            storage_keys=storage_keys,
        )

    if usage.rendered_minutes_this_period + estimated_render_minutes > entitlement.monthly_render_minutes:
        return _rejected_plan(
            reason="monthly render minute quota exceeded",
            estimated_render_minutes=estimated_render_minutes,
            storage_keys=storage_keys,
        )

    queue_job = QueueJob(
        queue_name=queue_name,
        idempotency_key=_build_idempotency_key(request),
        priority=entitlement.queue_priority,
        payload=_build_queue_payload(
            request=request,
            tier=tier,
            storage_keys=storage_keys,
            estimated_render_minutes=estimated_render_minutes,
        ),
    )
    return RenderWorkflowPlan(
        accepted=True,
        reason=None,
        next_status=RenderJobStatus.RENDER_QUEUED,
        estimated_render_minutes=estimated_render_minutes,
        storage_keys=storage_keys,
        queue_job=queue_job,
    )


def can_transition_render_job(current: RenderJobStatus, next_status: RenderJobStatus) -> bool:
    return next_status == current or next_status in ALLOWED_RENDER_JOB_TRANSITIONS[current]


def transition_job_status(current: RenderJobStatus, next_status: RenderJobStatus) -> RenderJobStatus:
    if can_transition_render_job(current, next_status):
        return next_status
    raise ValueError(f"invalid render job transition: {current.value} -> {next_status.value}")


def _rejected_plan(
    *,
    reason: str,
    estimated_render_minutes: int,
    storage_keys: MediaStorageKeys,
) -> RenderWorkflowPlan:
    return RenderWorkflowPlan(
        accepted=False,
        reason=reason,
        next_status=RenderJobStatus.CREATED,
        estimated_render_minutes=estimated_render_minutes,
        storage_keys=storage_keys,
        queue_job=None,
    )


def _build_queue_payload(
    *,
    request: RenderWorkflowRequest,
    tier: SubscriptionTier,
    storage_keys: MediaStorageKeys,
    estimated_render_minutes: int,
) -> Mapping[str, Any]:
    return MappingProxyType(
        {
            "schema_version": WORKFLOW_SCHEMA_VERSION,
            "workspace_id": request.workspace_id,
            "project_id": request.project_id,
            "user_id": request.user_id,
            "source_asset_id": request.source_asset_id,
            "subscription_tier": tier.value,
            "storage": storage_keys.to_dict(),
            "render": {
                "render_engine": "hyperframes",
                "brand_name": request.brand_name,
                "audience": request.audience,
                "clip_count": request.clip_count,
                "platforms": list(request.normalized_platforms),
                "estimated_minutes": estimated_render_minutes,
                "template": {
                    "variant": request.template_variant,
                    "parameters": dict(sorted(request.template_parameters.items())),
                },
                "style_options": dict(request.style_options),
                "caption_timeline": [dict(cue) for cue in request.caption_timeline],
                "source_assets": [
                    {
                        "role": "primary_video",
                        "asset_id": request.source_asset_id,
                        "storage_key": storage_keys.raw_source_key,
                    }
                ],
                "composition": {
                    "aspect_ratio": "9:16",
                    "width": 1080,
                    "height": 1920,
                    "fps": 30,
                },
                "output_settings": {
                    "format": "mp4",
                    "video_codec": "h264",
                    "audio_codec": "aac",
                },
            },
        }
    )


def _build_idempotency_key(request: RenderWorkflowRequest) -> str:
    platforms = ",".join(request.normalized_platforms)
    return (
        f"render:{request.workspace_id}:{request.project_id}:"
        f"{request.source_asset_id}:{request.clip_count}:{platforms}:"
        f"{request.template_variant}:{_render_intent_fingerprint(request)}"
    )


def _slugify_filename(value: str) -> str:
    normalized = value.strip().replace("/", " ").replace("\\", " ").lower()
    slug = re.sub(r"[^a-z0-9.]+", "-", normalized).strip(".-")
    return slug or "source"


def _require_text(name: str, value: str) -> None:
    if not value.strip():
        raise ValueError(f"{name} is required")


def _render_intent_fingerprint(request: RenderWorkflowRequest) -> str:
    serialized = json.dumps(
        {
            "caption_timeline": request.caption_timeline,
            "style_options": request.style_options,
            "template_parameters": request.template_parameters,
            "template_variant": request.template_variant,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:12]


def _validate_template_parameters(parameters: Mapping[str, str | int | float | bool]) -> None:
    if len(parameters) > 50:
        raise ValueError("template_parameters cannot contain more than 50 entries")
    for key, value in parameters.items():
        if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]{0,63}", key):
            raise ValueError("template_parameters keys must be safe identifiers")
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            continue
        if isinstance(value, str) and _is_safe_display_text(value, 500):
            continue
        raise ValueError("template_parameters values must be safe primitive values")


def _validate_style_options(style_options: Mapping[str, str]) -> None:
    required_fields = {
        "font_family",
        "brand_color",
        "caption_position",
        "overlay_position",
    }
    missing_fields = required_fields - set(style_options)
    if missing_fields:
        raise ValueError(f"style_options missing required fields: {', '.join(sorted(missing_fields))}")
    if not _is_safe_display_text(style_options["font_family"], 80):
        raise ValueError("font_family must be safe display text")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", style_options["brand_color"]):
        raise ValueError("brand_color must be a six-digit hex color")
    if "accent_color" in style_options and not re.fullmatch(r"#[0-9a-fA-F]{6}", style_options["accent_color"]):
        raise ValueError("accent_color must be a six-digit hex color")
    if style_options["caption_position"] not in {"top", "center", "bottom"}:
        raise ValueError("caption_position must be top, center, or bottom")
    if style_options["overlay_position"] not in {"top", "center", "bottom", "left", "right"}:
        raise ValueError("overlay_position must be top, center, bottom, left, or right")


def _validate_caption_timeline(caption_timeline: tuple[Mapping[str, Any], ...]) -> None:
    if not caption_timeline:
        raise ValueError("caption_timeline must include at least one cue")
    if len(caption_timeline) > 500:
        raise ValueError("caption_timeline cannot contain more than 500 cues")
    for cue in caption_timeline:
        start_ms = cue.get("start_ms")
        end_ms = cue.get("end_ms")
        text = cue.get("text")
        if (
            not isinstance(start_ms, int)
            or start_ms < 0
            or not isinstance(end_ms, int)
            or end_ms <= start_ms
            or not isinstance(text, str)
            or not _is_safe_display_text(text, 500)
        ):
            raise ValueError("caption_timeline cues must include start_ms, end_ms, and safe text")
        speaker = cue.get("speaker")
        if speaker is not None and (not isinstance(speaker, str) or not _is_safe_display_text(speaker, 80)):
            raise ValueError("caption_timeline speaker must be safe display text")


def _is_safe_display_text(value: str, max_length: int) -> bool:
    normalized = value.strip()
    return (
        0 < len(normalized) <= max_length
        and not re.search(r"[\x00-\x1f\x7f]|javascript:|data:|https?://|[`$<>]", normalized, re.IGNORECASE)
    )
