"""FFmpeg rendering plan for short-form clips."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import subprocess
from typing import Any, Callable, Protocol

from llm.content_ops.agent import ClipCandidate, ShortformContentPlan


class CompletedProcessLike(Protocol):
    returncode: int
    stdout: str | bytes | None
    stderr: str | bytes | None


Runner = Callable[..., CompletedProcessLike]


@dataclass(frozen=True)
class RenderSettings:
    output_dir: Path
    ffmpeg_path: str = "ffmpeg"
    width: int = 1080
    height: int = 1920
    overlay_width: int = 940
    overlay_height: int = 360
    burn_in_hook: bool = True
    overwrite: bool = True
    video_codec: str = "libx264"
    audio_codec: str = "aac"
    audio_bitrate: str = "128k"
    preset: str = "veryfast"
    crf: int = 23
    pixel_format: str = "yuv420p"


@dataclass(frozen=True)
class RenderJob:
    clip_id: str
    source_video: Path
    output_path: Path
    start_seconds: int
    end_seconds: int
    hook_overlay: str | None
    overlay_path: Path | None
    command: tuple[str, ...]

    @property
    def duration_seconds(self) -> int:
        return max(0, self.end_seconds - self.start_seconds)

    def to_dict(self) -> dict[str, Any]:
        return {
            "clip_id": self.clip_id,
            "source_video": str(self.source_video),
            "output_path": str(self.output_path),
            "start_seconds": self.start_seconds,
            "end_seconds": self.end_seconds,
            "duration_seconds": self.duration_seconds,
            "hook_overlay": self.hook_overlay,
            "overlay_path": str(self.overlay_path) if self.overlay_path else None,
            "command": list(self.command),
        }


@dataclass(frozen=True)
class RenderManifest:
    source_video: Path
    output_dir: Path
    jobs: tuple[RenderJob, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_video": str(self.source_video),
            "output_dir": str(self.output_dir),
            "jobs": [job.to_dict() for job in self.jobs],
        }


@dataclass(frozen=True)
class RenderResult:
    clip_id: str
    output_path: Path
    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.returncode == 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "clip_id": self.clip_id,
            "output_path": str(self.output_path),
            "returncode": self.returncode,
            "ok": self.ok,
            "stdout": self.stdout,
            "stderr": self.stderr,
        }


class FfmpegRenderPlanner:
    """Create deterministic FFmpeg render jobs from a content plan."""

    def create_manifest(
        self,
        plan: ShortformContentPlan,
        source_video: Path,
        settings: RenderSettings,
    ) -> RenderManifest:
        jobs = tuple(
            self._create_job(clip=clip, source_video=source_video, settings=settings)
            for clip in plan.clips
        )
        return RenderManifest(
            source_video=source_video,
            output_dir=settings.output_dir,
            jobs=jobs,
        )

    def _create_job(
        self,
        clip: ClipCandidate,
        source_video: Path,
        settings: RenderSettings,
    ) -> RenderJob:
        output_path = settings.output_dir / f"{clip.id}-{_slugify(clip.title)}.mp4"
        hook_overlay = clip.hook if settings.burn_in_hook else None
        overlay_path = _create_hook_overlay_asset(clip, settings) if hook_overlay else None
        command = _build_ffmpeg_command(
            clip=clip,
            source_video=source_video,
            output_path=output_path,
            hook_overlay=hook_overlay,
            overlay_path=overlay_path,
            settings=settings,
        )
        return RenderJob(
            clip_id=clip.id,
            source_video=source_video,
            output_path=output_path,
            start_seconds=clip.start_seconds,
            end_seconds=clip.end_seconds,
            hook_overlay=hook_overlay,
            overlay_path=overlay_path,
            command=command,
        )


class RenderExecutor:
    """Execute render jobs with an injectable runner for tests."""

    def __init__(self, runner: Runner | None = None) -> None:
        self.runner = runner or subprocess.run

    def execute(self, manifest: RenderManifest) -> tuple[RenderResult, ...]:
        results: tuple[RenderResult, ...] = ()
        for job in manifest.jobs:
            job.output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                completed = self._run_command(job.command)
            except FileNotFoundError:
                results = (
                    *results,
                    RenderResult(
                        clip_id=job.clip_id,
                        output_path=job.output_path,
                        returncode=127,
                        stdout="",
                        stderr=f"{job.command[0]} not found",
                    ),
                )
                continue

            retry_stderr = ""
            if completed.returncode != 0 and _missing_drawtext_filter(completed.stderr):
                fallback_command = _command_without_drawtext(job.command)
                if fallback_command != job.command:
                    retry_stderr = (
                        _decode_output(completed.stderr)
                        + "\nRetried without hook overlay because FFmpeg is missing drawtext.\n"
                    )
                    try:
                        completed = self._run_command(fallback_command)
                    except FileNotFoundError:
                        results = (
                            *results,
                            RenderResult(
                                clip_id=job.clip_id,
                                output_path=job.output_path,
                                returncode=127,
                                stdout="",
                                stderr=f"{job.command[0]} not found",
                            ),
                        )
                        continue
            elif completed.returncode != 0 and _missing_overlay_filter(completed.stderr):
                fallback_command = _command_without_overlay_asset(job.command)
                if fallback_command != job.command:
                    retry_stderr = (
                        _decode_output(completed.stderr)
                        + "\nRetried without overlay asset because FFmpeg is missing overlay support.\n"
                    )
                    try:
                        completed = self._run_command(fallback_command)
                    except FileNotFoundError:
                        results = (
                            *results,
                            RenderResult(
                                clip_id=job.clip_id,
                                output_path=job.output_path,
                                returncode=127,
                                stdout="",
                                stderr=f"{job.command[0]} not found",
                            ),
                        )
                        continue

            results = (
                *results,
                RenderResult(
                    clip_id=job.clip_id,
                    output_path=job.output_path,
                    returncode=completed.returncode,
                    stdout=_decode_output(completed.stdout),
                    stderr=retry_stderr + _decode_output(completed.stderr),
                ),
            )
        return results

    def _run_command(self, command: tuple[str, ...]) -> CompletedProcessLike:
        return self.runner(
            list(command),
            capture_output=True,
            text=True,
            shell=False,
            check=False,
        )


def _build_ffmpeg_command(
    clip: ClipCandidate,
    source_video: Path,
    output_path: Path,
    hook_overlay: str | None,
    overlay_path: Path | None,
    settings: RenderSettings,
) -> tuple[str, ...]:
    command: tuple[str, ...] = (settings.ffmpeg_path,)
    if settings.overwrite:
        command = (*command, "-y")
    if overlay_path:
        return (
            *command,
            "-ss",
            _format_seconds(clip.start_seconds),
            "-i",
            str(source_video),
            "-loop",
            "1",
            "-i",
            str(overlay_path),
            "-t",
            _format_seconds(clip.duration_seconds),
            "-filter_complex",
            _image_overlay_filter(settings),
            "-map",
            "[v]",
            "-map",
            "0:a?",
            "-c:v",
            settings.video_codec,
            "-preset",
            settings.preset,
            "-crf",
            str(settings.crf),
            "-pix_fmt",
            settings.pixel_format,
            "-c:a",
            settings.audio_codec,
            "-b:a",
            settings.audio_bitrate,
            "-shortest",
            "-movflags",
            "+faststart",
            str(output_path),
        )
    command = (
        *command,
        "-ss",
        _format_seconds(clip.start_seconds),
        "-i",
        str(source_video),
        "-t",
        _format_seconds(clip.duration_seconds),
        "-vf",
        _video_filter(settings, hook_overlay),
        "-c:v",
        settings.video_codec,
        "-preset",
        settings.preset,
        "-crf",
        str(settings.crf),
        "-pix_fmt",
        settings.pixel_format,
        "-c:a",
        settings.audio_codec,
        "-b:a",
        settings.audio_bitrate,
        "-movflags",
        "+faststart",
        str(output_path),
    )
    return command


def _image_overlay_filter(settings: RenderSettings) -> str:
    base_filter = _base_video_filter(settings)
    return f"[0:v]{base_filter}[base];[base][1:v]overlay=(W-w)/2:H*0.08:format=auto[v]"


def _video_filter(settings: RenderSettings, hook_overlay: str | None) -> str:
    filters: tuple[str, ...] = _base_video_filters(settings)
    if hook_overlay:
        filters = (*filters, _drawtext_filter(hook_overlay, settings))
    return ",".join(filters)


def _base_video_filter(settings: RenderSettings) -> str:
    return ",".join(_base_video_filters(settings))


def _base_video_filters(settings: RenderSettings) -> tuple[str, ...]:
    return (
        f"scale={settings.width}:{settings.height}:force_original_aspect_ratio=increase",
        f"crop={settings.width}:{settings.height}",
        "setsar=1",
    )


def _drawtext_filter(text: str, settings: RenderSettings) -> str:
    escaped = _escape_drawtext(_wrap_overlay_text(text))
    font_size = max(42, round(settings.width * 0.052))
    box_border = max(24, round(settings.width * 0.025))
    return (
        "drawtext="
        f"text='{escaped}':"
        "fontcolor=white:"
        f"fontsize={font_size}:"
        "line_spacing=10:"
        "box=1:"
        "boxcolor=black@0.62:"
        f"boxborderw={box_border}:"
        "x=(w-text_w)/2:"
        "y=h*0.12"
    )


def _wrap_overlay_text(text: str, line_length: int = 28) -> str:
    words = text.split()
    lines: tuple[str, ...] = ()
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > line_length:
            lines = (*lines, current)
            current = word
            continue
        current = candidate
    if current:
        lines = (*lines, current)
    return "\n".join(lines[:3])


def _escape_drawtext(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
        .replace("\n", "\\n")
    )


def _format_seconds(seconds: int) -> str:
    return f"{seconds:.3f}"


def _create_hook_overlay_asset(clip: ClipCandidate, settings: RenderSettings) -> Path | None:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return None

    overlay_dir = settings.output_dir / "overlays"
    overlay_dir.mkdir(parents=True, exist_ok=True)
    overlay_path = overlay_dir / f"{clip.id}-{_slugify(clip.title)}-hook.png"

    image = Image.new("RGBA", (settings.overlay_width, settings.overlay_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    card_margin = 18
    card_bounds = (
        card_margin,
        card_margin,
        settings.overlay_width - card_margin,
        settings.overlay_height - card_margin,
    )
    draw.rounded_rectangle(card_bounds, radius=38, fill=(10, 13, 22, 218))
    draw.rounded_rectangle(card_bounds, radius=38, outline=(255, 255, 255, 36), width=2)
    draw.rounded_rectangle((44, 52, 58, settings.overlay_height - 52), radius=7, fill=(67, 211, 158, 255))

    label_font = _load_font(ImageFont, 28, bold=True)
    title_font = _load_font(ImageFont, 34, bold=True)
    hook_font = _load_font(ImageFont, 56, bold=True)

    draw.rounded_rectangle((84, 48, 250, 90), radius=21, fill=(67, 211, 158, 44))
    draw.text((106, 55), "CLIP HOOK", font=label_font, fill=(122, 255, 205, 255))
    draw.text((84, 106), clip.title.upper(), font=title_font, fill=(194, 205, 220, 255))

    hook_lines = _wrap_text_for_font(draw, clip.hook, hook_font, settings.overlay_width - 170)
    y = 158
    for line in hook_lines[:3]:
        draw.text((84, y), line, font=hook_font, fill=(255, 255, 255, 255))
        y += 66

    image.save(overlay_path)
    return overlay_path


def _load_font(image_font: Any, size: int, *, bold: bool = False) -> Any:
    candidates = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/Library/Fonts/Arial.ttf",
    )
    for candidate in candidates:
        if bold and "Bold" not in candidate:
            continue
        try:
            return image_font.truetype(candidate, size=size)
        except OSError:
            continue
    return image_font.load_default()


def _wrap_text_for_font(draw: Any, text: str, font: Any, max_width: int) -> tuple[str, ...]:
    words = text.split()
    lines: tuple[str, ...] = ()
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and draw.textlength(candidate, font=font) > max_width:
            lines = (*lines, current)
            current = word
            continue
        current = candidate
    if current:
        lines = (*lines, current)
    return lines


def _missing_drawtext_filter(stderr: str | bytes | None) -> bool:
    text = _decode_output(stderr)
    return "No such filter" in text and "drawtext" in text


def _missing_overlay_filter(stderr: str | bytes | None) -> bool:
    text = _decode_output(stderr)
    return "No such filter" in text and "overlay" in text


def _command_without_drawtext(command: tuple[str, ...]) -> tuple[str, ...]:
    if "-vf" not in command:
        return command
    vf_index = command.index("-vf")
    if vf_index + 1 >= len(command):
        return command

    filters = tuple(
        filter_part
        for filter_part in command[vf_index + 1].split(",")
        if not filter_part.startswith("drawtext=")
    )
    if len(filters) == len(command[vf_index + 1].split(",")):
        return command

    updated = list(command)
    updated[vf_index + 1] = ",".join(filters)
    return tuple(updated)


def _command_without_overlay_asset(command: tuple[str, ...]) -> tuple[str, ...]:
    if "-filter_complex" not in command:
        return command

    first_input_index = command.index("-i")
    source_prefix = command[: first_input_index + 2]
    filter_index = command.index("-filter_complex")
    if filter_index + 1 >= len(command):
        return command

    duration = _option_value_before(command, "-t", filter_index)
    base_filter = _base_filter_from_complex(command[filter_index + 1])
    suffix = _strip_map_options(command[filter_index + 2 :])

    fallback = (*source_prefix,)
    if duration:
        fallback = (*fallback, "-t", duration)
    fallback = (*fallback, "-vf", base_filter, *suffix)
    return fallback


def _option_value_before(command: tuple[str, ...], option: str, before_index: int) -> str | None:
    for index in range(before_index):
        if command[index] == option and index + 1 < before_index:
            return command[index + 1]
    return None


def _base_filter_from_complex(filter_complex: str) -> str:
    base_filter = filter_complex.split("[base];", 1)[0]
    return base_filter.removeprefix("[0:v]")


def _strip_map_options(args: tuple[str, ...]) -> tuple[str, ...]:
    stripped: tuple[str, ...] = ()
    index = 0
    while index < len(args):
        if args[index] == "-map" and index + 1 < len(args):
            index += 2
            continue
        stripped = (*stripped, args[index])
        index += 1
    return stripped


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "clip"


def _decode_output(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value
