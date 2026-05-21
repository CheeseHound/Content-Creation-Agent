"""CLI for the short-form content operations agent."""

from __future__ import annotations

import argparse
from datetime import date
import json
from pathlib import Path
from typing import Sequence

from llm.content_ops.agent import ShortformContentAgent, ShortformContentRequest
from llm.content_ops.rendering import FfmpegRenderPlanner, RenderExecutor, RenderSettings
from llm.content_ops.transcription import (
    AudioExtractionSettings,
    FfmpegAudioExtractor,
    OpenAITranscriber,
    VideoTranscriptionPipeline,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="content-ops-agent",
        description="Turn a long-form transcript into a short-form content operations plan.",
    )
    parser.add_argument(
        "transcript",
        type=Path,
        nargs="?",
        help="Path to a transcript text file. Omit when using --transcribe with --video.",
    )
    parser.add_argument("--brand", required=True, help="Brand or client name.")
    parser.add_argument(
        "--audience",
        default="target customers",
        help="Audience the content should speak to.",
    )
    parser.add_argument(
        "--platforms",
        default="tiktok,instagram_reels,youtube_shorts",
        help="Comma-separated platform list.",
    )
    parser.add_argument(
        "--clips",
        type=int,
        default=5,
        help="Number of clip opportunities to return.",
    )
    parser.add_argument(
        "--start-date",
        type=_parse_date,
        default=None,
        help="First publish date in YYYY-MM-DD format.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output.",
    )
    parser.add_argument(
        "--video",
        type=Path,
        default=None,
        help="Optional source video path for generating FFmpeg render jobs.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("clips"),
        help="Directory for rendered clip outputs when --video is provided.",
    )
    parser.add_argument(
        "--render",
        action="store_true",
        help="Execute FFmpeg render jobs. By default the CLI only emits the manifest.",
    )
    parser.add_argument(
        "--ffmpeg-path",
        default="ffmpeg",
        help="FFmpeg executable path.",
    )
    parser.add_argument(
        "--no-hook-overlay",
        action="store_true",
        help="Disable burned-in hook text overlays in generated FFmpeg jobs.",
    )
    parser.add_argument(
        "--transcribe",
        action="store_true",
        help="Generate the transcript from --video before planning clips.",
    )
    parser.add_argument(
        "--transcription-provider",
        default="openai",
        choices=("openai",),
        help="Speech-to-text provider to use with --transcribe.",
    )
    parser.add_argument(
        "--transcription-model",
        default="whisper-1",
        help="Speech-to-text model for the selected provider.",
    )
    parser.add_argument(
        "--audio-path",
        type=Path,
        default=None,
        help="Optional extracted WAV path for transcription.",
    )
    parser.add_argument(
        "--transcript-out",
        type=Path,
        default=None,
        help="Optional path to write the generated transcript.",
    )
    return parser


def run(args: argparse.Namespace) -> int:
    if args.render and args.video is None:
        raise ValueError("--render requires --video")
    if args.transcribe and args.video is None:
        raise ValueError("--transcribe requires --video")
    if args.transcript is None and not args.transcribe:
        raise ValueError("transcript is required unless --transcribe is used")

    transcription_payload = None
    if args.transcribe:
        try:
            transcription = _build_transcription_pipeline(args).transcribe(args.video)
        except Exception as exc:
            transcription_payload = {"ok": False, "error": str(exc)}
            print(json.dumps({"transcription": transcription_payload}, indent=2 if args.pretty else None))
            return 1
        transcription_payload = transcription.to_dict()
        if not transcription.ok:
            print(json.dumps({"transcription": transcription_payload}, indent=2 if args.pretty else None))
            return 1
        transcript = transcription.transcript
        if args.transcript_out is not None:
            args.transcript_out.parent.mkdir(parents=True, exist_ok=True)
            args.transcript_out.write_text(transcript, encoding="utf-8")
    else:
        transcript = args.transcript.read_text(encoding="utf-8")

    request = ShortformContentRequest(
        transcript=transcript,
        brand_name=args.brand,
        audience=args.audience,
        platforms=_parse_platforms(args.platforms),
        clip_count=args.clips,
        start_date=args.start_date,
    )
    plan = ShortformContentAgent().analyze(request)
    payload = plan.to_dict()
    if transcription_payload is not None:
        payload["transcription"] = transcription_payload
    exit_code = 0

    if args.video is not None:
        manifest = FfmpegRenderPlanner().create_manifest(
            plan=plan,
            source_video=args.video,
            settings=RenderSettings(
                output_dir=args.output_dir,
                ffmpeg_path=args.ffmpeg_path,
                burn_in_hook=not args.no_hook_overlay,
            ),
        )
        payload["render_manifest"] = manifest.to_dict()
        if args.render:
            results = RenderExecutor().execute(manifest)
            payload["render_results"] = [result.to_dict() for result in results]
            exit_code = 0 if all(result.ok for result in results) else 1
        else:
            payload["render_results"] = None

    indent = 2 if args.pretty else None
    print(json.dumps(payload, indent=indent, sort_keys=args.pretty))
    return exit_code


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return run(args)


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("date must use YYYY-MM-DD format") from exc


def _parse_platforms(value: str) -> tuple[str, ...]:
    platforms = tuple(platform.strip() for platform in value.split(",") if platform.strip())
    return platforms or ("tiktok", "instagram_reels", "youtube_shorts")


def _build_transcription_pipeline(args: argparse.Namespace) -> VideoTranscriptionPipeline:
    audio_path = args.audio_path or args.output_dir / f"{args.video.stem}-transcribe.wav"
    return VideoTranscriptionPipeline(
        extractor=FfmpegAudioExtractor(
            settings=AudioExtractionSettings(
                audio_path=audio_path,
                ffmpeg_path=args.ffmpeg_path,
            )
        ),
        transcriber=OpenAITranscriber(model=args.transcription_model),
    )


if __name__ == "__main__":
    raise SystemExit(main())
