import json
from datetime import date
from pathlib import Path

from llm.content_ops import ShortformContentAgent, ShortformContentRequest
from llm.content_ops.cli import build_parser, run
from llm.content_ops.rendering import (
    FfmpegRenderPlanner,
    RenderExecutor,
    RenderJob,
    RenderManifest,
    RenderSettings,
)


SAMPLE_TRANSCRIPT = """
[00:00:00 - 00:00:18] Founder: Most companies do not need another AI editing tool. They need a daily content system.
[00:00:18 - 00:00:45] Founder: A full-time editor can cost a couple thousand dollars per month, and the workflow still depends on someone planning hooks, posting, and analyzing results.
[00:00:45 - 00:01:11] Founder: The practical solution is an AI agent that takes a ten minute video, finds the strongest moments, writes the hooks, prepares captions, and schedules the clips.
""".strip()


def _plan():
    return ShortformContentAgent().analyze(
        ShortformContentRequest(
            transcript=SAMPLE_TRANSCRIPT,
            brand_name="ClipOps",
            audience="founder-led B2B companies",
            clip_count=2,
            start_date=date(2026, 5, 25),
        )
    )


def test_ffmpeg_planner_creates_render_jobs_for_each_clip(tmp_path):
    manifest = FfmpegRenderPlanner().create_manifest(
        plan=_plan(),
        source_video=Path("/tmp/source-video.mp4"),
        settings=RenderSettings(output_dir=tmp_path),
    )

    assert len(manifest.jobs) == 2
    first = manifest.jobs[0]
    assert first.clip_id == "clip-02"
    assert first.output_path.parent == tmp_path
    assert first.output_path.name == "clip-02-replace-editing-friction.mp4"
    assert first.overlay_path is not None
    assert first.overlay_path.exists()
    assert first.overlay_path.read_bytes().startswith(b"\x89PNG")
    assert first.command[0] == "ffmpeg"
    assert "-ss" in first.command
    assert "-t" in first.command
    assert "-filter_complex" in first.command
    video_filter = first.command[first.command.index("-filter_complex") + 1]
    assert "scale=1080:1920:force_original_aspect_ratio=increase" in video_filter
    assert "overlay=(W-w)/2:H*0.08" in video_filter
    assert first.command[first.command.index("-pix_fmt") + 1] == "yuv420p"
    assert first.command[-1] == str(first.output_path)


def test_render_manifest_serializes_paths_and_commands(tmp_path):
    manifest = FfmpegRenderPlanner().create_manifest(
        plan=_plan(),
        source_video=Path("/tmp/source-video.mp4"),
        settings=RenderSettings(output_dir=tmp_path, burn_in_hook=False),
    )

    payload = manifest.to_dict()

    assert payload["source_video"] == "/tmp/source-video.mp4"
    assert len(payload["jobs"]) == 2
    assert payload["jobs"][0]["command"][0] == "ffmpeg"
    assert payload["jobs"][0]["hook_overlay"] is None
    assert payload["jobs"][0]["overlay_path"] is None


def test_render_executor_uses_command_list_without_shell(tmp_path):
    calls = []

    def fake_runner(command, **kwargs):
        calls.append((command, kwargs))
        return type("Completed", (), {"returncode": 0, "stdout": "ok", "stderr": ""})()

    manifest = FfmpegRenderPlanner().create_manifest(
        plan=_plan(),
        source_video=Path("/tmp/source-video.mp4"),
        settings=RenderSettings(output_dir=tmp_path),
    )

    results = RenderExecutor(runner=fake_runner).execute(manifest)

    assert len(results) == 2
    assert all(result.returncode == 0 for result in results)
    assert calls[0][0][0] == "ffmpeg"
    assert calls[0][1]["shell"] is False


def test_render_executor_reports_missing_ffmpeg(tmp_path):
    def missing_runner(command, **kwargs):
        raise FileNotFoundError(command[0])

    manifest = FfmpegRenderPlanner().create_manifest(
        plan=_plan(),
        source_video=Path("/tmp/source-video.mp4"),
        settings=RenderSettings(output_dir=tmp_path),
    )

    results = RenderExecutor(runner=missing_runner).execute(manifest)

    assert results[0].returncode == 127
    assert results[0].ok is False
    assert "not found" in results[0].stderr


def test_render_executor_retries_without_drawtext_when_filter_is_missing(tmp_path):
    calls = []

    def flaky_runner(command, **kwargs):
        calls.append(command)
        if len(calls) == 1:
            return type(
                "Completed",
                (),
                {
                    "returncode": 8,
                    "stdout": "",
                    "stderr": "No such filter: 'drawtext'",
                },
            )()
        return type("Completed", (), {"returncode": 0, "stdout": "ok", "stderr": ""})()

    output_path = tmp_path / "clip.mp4"
    manifest = RenderManifest(
        source_video=Path("/tmp/source-video.mp4"),
        output_dir=tmp_path,
        jobs=(
            RenderJob(
                clip_id="clip-legacy",
                source_video=Path("/tmp/source-video.mp4"),
                output_path=output_path,
                start_seconds=0,
                end_seconds=10,
                hook_overlay="Legacy drawtext",
                overlay_path=None,
                command=(
                    "ffmpeg",
                    "-y",
                    "-ss",
                    "0.000",
                    "-i",
                    "/tmp/source-video.mp4",
                    "-t",
                    "10.000",
                    "-vf",
                    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,drawtext=text='Legacy'",
                    "-c:v",
                    "libx264",
                    str(output_path),
                ),
            ),
        ),
    )

    results = RenderExecutor(runner=flaky_runner).execute(manifest)

    assert results[0].ok is True
    assert len(calls) == 2
    assert "drawtext=" in calls[0][calls[0].index("-vf") + 1]
    assert "drawtext=" not in calls[1][calls[1].index("-vf") + 1]
    assert "Retried without hook overlay" in results[0].stderr


def test_image_overlay_jobs_retry_without_overlay_if_filter_fails(tmp_path):
    calls = []

    def flaky_runner(command, **kwargs):
        calls.append(command)
        if len(calls) == 1:
            return type(
                "Completed",
                (),
                {
                    "returncode": 8,
                    "stdout": "",
                    "stderr": "No such filter: 'overlay'",
                },
            )()
        return type("Completed", (), {"returncode": 0, "stdout": "ok", "stderr": ""})()

    manifest = FfmpegRenderPlanner().create_manifest(
        plan=_plan(),
        source_video=Path("/tmp/source-video.mp4"),
        settings=RenderSettings(output_dir=tmp_path),
    )

    results = RenderExecutor(runner=flaky_runner).execute(manifest)

    assert results[0].ok is True
    assert "-filter_complex" in calls[0]
    assert "-vf" in calls[1]
    assert "Retried without overlay asset" in results[0].stderr


def test_cli_can_include_render_manifest_without_rendering(tmp_path, capsys):
    transcript_path = tmp_path / "transcript.txt"
    transcript_path.write_text(SAMPLE_TRANSCRIPT, encoding="utf-8")
    output_dir = tmp_path / "clips"
    parser = build_parser()
    args = parser.parse_args([
        str(transcript_path),
        "--brand",
        "ClipOps",
        "--audience",
        "founder-led B2B companies",
        "--clips",
        "2",
        "--video",
        "/tmp/source-video.mp4",
        "--output-dir",
        str(output_dir),
    ])

    exit_code = run(args)

    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert len(payload["render_manifest"]["jobs"]) == 2
    assert payload["render_results"] is None
    assert payload["render_manifest"]["jobs"][0]["output_path"].startswith(str(output_dir))
