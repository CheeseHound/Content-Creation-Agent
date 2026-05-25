import pytest

from llm.content_ops.platform import (
    DEFAULT_ENTITLEMENTS,
    RenderJobStatus,
    RenderWorkflowRequest,
    SubscriptionTier,
    UsageSnapshot,
    build_storage_keys,
    plan_render_workflow,
    transition_job_status,
)


def _request(**overrides):
    base = {
        "workspace_id": "workspace_123",
        "project_id": "project_456",
        "user_id": "user_789",
        "source_asset_id": "asset_abc",
        "source_filename": "Founder demo.mov",
        "source_size_bytes": 250_000_000,
        "duration_seconds": 185,
        "brand_name": "ClipOps",
        "audience": "founder-led B2B companies",
        "clip_count": 4,
        "platforms": ("tiktok", "instagram_reels", "youtube_shorts"),
        "template_variant": "bold-captions",
        "template_parameters": {
            "hook_text": "Stop wasting demo footage",
            "show_progress_bar": True,
        },
        "style_options": {
            "font_family": "Inter",
            "brand_color": "#1D4ED8",
            "accent_color": "#F97316",
            "caption_position": "bottom",
            "overlay_position": "center",
        },
        "caption_timeline": (
            {
                "start_ms": 0,
                "end_ms": 1_800,
                "text": "Stop wasting your best demo footage.",
            },
        ),
    }
    return RenderWorkflowRequest(**{**base, **overrides})


def test_plan_render_workflow_accepts_request_and_builds_queue_payload():
    plan = plan_render_workflow(
        request=_request(),
        tier=SubscriptionTier.CREATOR,
        usage=UsageSnapshot(active_render_jobs=1, rendered_minutes_this_period=24),
    )

    assert plan.accepted is True
    assert plan.next_status == RenderJobStatus.RENDER_QUEUED
    assert plan.estimated_render_minutes == 16
    assert plan.storage_keys.raw_source_key.endswith("/uploads/asset_abc/founder-demo.mov")
    assert plan.storage_keys.transcript_key.endswith("/transcripts/asset_abc/transcript.json")
    assert plan.storage_keys.render_output_prefix.endswith("/renders/asset_abc/")
    assert plan.queue_job is not None
    assert plan.queue_job.queue_name == "content-ops-render"
    assert plan.queue_job.idempotency_key == (
        "render:workspace_123:project_456:asset_abc:4:"
        "instagram_reels,tiktok,youtube_shorts:bold-captions:db8145bbf0dd"
    )
    assert plan.queue_job.payload["schema_version"] == "content_ops.render_job.v1"
    assert plan.queue_job.payload["storage"]["source_key"] == plan.storage_keys.raw_source_key
    assert plan.queue_job.payload["render"]["render_engine"] == "hyperframes"
    assert plan.queue_job.payload["render"]["template"] == {
        "variant": "bold-captions",
        "parameters": {
            "hook_text": "Stop wasting demo footage",
            "show_progress_bar": True,
        },
    }
    assert plan.queue_job.payload["render"]["style_options"]["brand_color"] == "#1D4ED8"
    assert plan.queue_job.payload["render"]["caption_timeline"] == [
        {
            "start_ms": 0,
            "end_ms": 1_800,
            "text": "Stop wasting your best demo footage.",
        },
    ]
    assert plan.queue_job.payload["render"]["clip_count"] == 4
    assert plan.queue_job.payload["render"]["platforms"] == [
        "instagram_reels",
        "tiktok",
        "youtube_shorts",
    ]
    assert "OPENAI_API_KEY" not in str(plan.queue_job.payload)
    assert "STRIPE_SECRET_KEY" not in str(plan.queue_job.payload)


def test_plan_render_workflow_rejects_when_subscription_minutes_are_exceeded():
    plan = plan_render_workflow(
        request=_request(duration_seconds=600, clip_count=5),
        tier=SubscriptionTier.CREATOR,
        usage=UsageSnapshot(active_render_jobs=0, rendered_minutes_this_period=175),
    )

    assert plan.accepted is False
    assert plan.queue_job is None
    assert plan.reason == "monthly render minute quota exceeded"


def test_plan_render_workflow_rejects_when_active_job_limit_is_reached():
    entitlement = DEFAULT_ENTITLEMENTS[SubscriptionTier.FREE]

    plan = plan_render_workflow(
        request=_request(),
        tier=SubscriptionTier.FREE,
        usage=UsageSnapshot(
            active_render_jobs=entitlement.max_active_render_jobs,
            rendered_minutes_this_period=0,
        ),
    )

    assert plan.accepted is False
    assert plan.reason == "active render job limit reached"


def test_storage_keys_are_workspace_and_project_scoped():
    keys = build_storage_keys(
        workspace_id="workspace_123",
        project_id="project_456",
        source_asset_id="asset_abc",
        source_filename="Q2 Launch / Cut 01.mp4",
    )

    assert keys.raw_source_key == (
        "workspaces/workspace_123/projects/project_456/uploads/asset_abc/"
        "q2-launch-cut-01.mp4"
    )
    assert keys.audio_key == (
        "workspaces/workspace_123/projects/project_456/audio/asset_abc/source.wav"
    )
    assert keys.transcript_key == (
        "workspaces/workspace_123/projects/project_456/transcripts/asset_abc/transcript.json"
    )
    assert keys.render_output_prefix == (
        "workspaces/workspace_123/projects/project_456/renders/asset_abc/"
    )


def test_render_job_transitions_allow_happy_path_and_block_invalid_jumps():
    status = transition_job_status(RenderJobStatus.CREATED, RenderJobStatus.UPLOADED)
    status = transition_job_status(status, RenderJobStatus.TRANSCRIBING)
    status = transition_job_status(status, RenderJobStatus.TRANSCRIBED)
    status = transition_job_status(status, RenderJobStatus.RENDER_QUEUED)
    status = transition_job_status(status, RenderJobStatus.RENDERING)
    status = transition_job_status(status, RenderJobStatus.READY)

    assert status == RenderJobStatus.READY

    with pytest.raises(ValueError, match="invalid render job transition"):
        transition_job_status(RenderJobStatus.CREATED, RenderJobStatus.READY)


def test_render_workflow_request_validates_external_inputs():
    with pytest.raises(ValueError, match="source_size_bytes"):
        _request(source_size_bytes=0)

    with pytest.raises(ValueError, match="clip_count"):
        _request(clip_count=0)

    with pytest.raises(ValueError, match="platforms"):
        _request(platforms=())

    with pytest.raises(ValueError, match="template_variant"):
        _request(template_variant="../shell")

    with pytest.raises(ValueError, match="brand_color"):
        _request(style_options={**_request().style_options, "brand_color": "javascript:red"})

    with pytest.raises(ValueError, match="caption_timeline"):
        _request(caption_timeline=({"start_ms": 2_000, "end_ms": 1_000, "text": "bad"},))
