"""Video transcription support for the short-form content ops agent."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import subprocess
from typing import Any, Callable, Protocol


class CompletedProcessLike(Protocol):
    returncode: int
    stdout: str | bytes | None
    stderr: str | bytes | None


Runner = Callable[..., CompletedProcessLike]


class SpeechToTextProvider(Protocol):
    provider: str

    def transcribe(self, audio_path: Path) -> TranscriptionResult: ...


@dataclass(frozen=True)
class AudioExtractionSettings:
    audio_path: Path
    ffmpeg_path: str = "ffmpeg"
    sample_rate: int = 16000
    channels: int = 1
    overwrite: bool = True


@dataclass(frozen=True)
class AudioExtractionResult:
    source_video: Path
    audio_path: Path
    command: tuple[str, ...]
    returncode: int | None = None
    stdout: str = ""
    stderr: str = ""

    @property
    def ok(self) -> bool:
        return self.returncode == 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_video": str(self.source_video),
            "audio_path": str(self.audio_path),
            "command": list(self.command),
            "returncode": self.returncode,
            "ok": self.ok,
            "stdout": self.stdout,
            "stderr": self.stderr,
        }


@dataclass(frozen=True)
class TranscriptionSegment:
    start_seconds: float
    end_seconds: float
    text: str
    speaker: str = "Speaker"

    def to_dict(self) -> dict[str, Any]:
        return {
            "start_seconds": self.start_seconds,
            "end_seconds": self.end_seconds,
            "speaker": self.speaker,
            "text": self.text,
        }


@dataclass(frozen=True)
class TranscriptionResult:
    provider: str
    model: str
    transcript: str
    segments: tuple[TranscriptionSegment, ...] = ()
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None and bool(self.transcript.strip())

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "model": self.model,
            "transcript": self.transcript,
            "segments": [segment.to_dict() for segment in self.segments],
            "ok": self.ok,
            "error": self.error,
        }


@dataclass(frozen=True)
class VideoTranscriptionResult:
    audio_extraction: AudioExtractionResult
    transcription: TranscriptionResult

    @property
    def ok(self) -> bool:
        return self.audio_extraction.ok and self.transcription.ok

    @property
    def transcript(self) -> str:
        return self.transcription.transcript

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "audio_extraction": self.audio_extraction.to_dict(),
            "transcription": self.transcription.to_dict(),
            "transcript": self.transcript,
        }


class FfmpegAudioExtractor:
    """Extract mono 16 kHz WAV audio from source video for transcription."""

    def __init__(
        self,
        settings: AudioExtractionSettings,
        runner: Runner | None = None,
    ) -> None:
        self.settings = settings
        self.runner = runner or subprocess.run

    def create_plan(self, source_video: Path) -> AudioExtractionResult:
        command = _build_audio_command(source_video, self.settings)
        return AudioExtractionResult(
            source_video=source_video,
            audio_path=self.settings.audio_path,
            command=command,
        )

    def extract(self, source_video: Path) -> AudioExtractionResult:
        plan = self.create_plan(source_video)
        plan.audio_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            completed = self.runner(
                list(plan.command),
                capture_output=True,
                text=True,
                shell=False,
                check=False,
            )
        except FileNotFoundError:
            return AudioExtractionResult(
                source_video=plan.source_video,
                audio_path=plan.audio_path,
                command=plan.command,
                returncode=127,
                stderr=f"{plan.command[0]} not found",
            )

        return AudioExtractionResult(
            source_video=plan.source_video,
            audio_path=plan.audio_path,
            command=plan.command,
            returncode=completed.returncode,
            stdout=_decode_output(completed.stdout),
            stderr=_decode_output(completed.stderr),
        )


class OpenAITranscriber:
    """Speech-to-text provider using OpenAI's audio transcriptions API."""

    provider = "openai"

    def __init__(
        self,
        *,
        client: Any | None = None,
        api_key: str | None = None,
        model: str = "whisper-1",
    ) -> None:
        self.model = model
        if client is not None:
            self.client = client
            return

        resolved_api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not resolved_api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAI transcription")

        from openai import OpenAI

        self.client = OpenAI(api_key=resolved_api_key)

    def transcribe(self, audio_path: Path) -> TranscriptionResult:
        with audio_path.open("rb") as audio_file:
            response = self.client.audio.transcriptions.create(
                model=self.model,
                file=audio_file,
                response_format="verbose_json",
            )

        segments = _segments_from_response(response)
        transcript = format_timestamped_transcript(segments) if segments else _response_text(response)
        return TranscriptionResult(
            provider=self.provider,
            model=self.model,
            transcript=transcript,
            segments=segments,
        )


class VideoTranscriptionPipeline:
    """Extract audio from video, then transcribe it with a speech-to-text provider."""

    def __init__(
        self,
        extractor: FfmpegAudioExtractor,
        transcriber: SpeechToTextProvider,
    ) -> None:
        self.extractor = extractor
        self.transcriber = transcriber

    def transcribe(self, source_video: Path) -> VideoTranscriptionResult:
        audio_result = self.extractor.extract(source_video)
        if not audio_result.ok:
            return VideoTranscriptionResult(
                audio_extraction=audio_result,
                transcription=TranscriptionResult(
                    provider=getattr(self.transcriber, "provider", "unknown"),
                    model="unknown",
                    transcript="",
                    error=audio_result.stderr or "audio extraction failed",
                ),
            )

        try:
            transcription = self.transcriber.transcribe(audio_result.audio_path)
        except Exception as exc:
            transcription = TranscriptionResult(
                provider=getattr(self.transcriber, "provider", "unknown"),
                model=getattr(self.transcriber, "model", "unknown"),
                transcript="",
                error=str(exc),
            )

        return VideoTranscriptionResult(
            audio_extraction=audio_result,
            transcription=transcription,
        )


def format_timestamped_transcript(segments: tuple[TranscriptionSegment, ...]) -> str:
    return "\n".join(
        (
            f"[{_format_timestamp(segment.start_seconds)} - {_format_timestamp(segment.end_seconds)}] "
            f"{segment.speaker}: {segment.text.strip()}"
        )
        for segment in segments
        if segment.text.strip()
    )


def _build_audio_command(
    source_video: Path,
    settings: AudioExtractionSettings,
) -> tuple[str, ...]:
    command: tuple[str, ...] = (settings.ffmpeg_path,)
    if settings.overwrite:
        command = (*command, "-y")
    return (
        *command,
        "-i",
        str(source_video),
        "-vn",
        "-ac",
        str(settings.channels),
        "-ar",
        str(settings.sample_rate),
        "-f",
        "wav",
        str(settings.audio_path),
    )


def _segments_from_response(response: Any) -> tuple[TranscriptionSegment, ...]:
    raw_segments = _get_attr(response, "segments", ()) or ()
    segments: tuple[TranscriptionSegment, ...] = ()
    for raw_segment in raw_segments:
        text = str(_get_attr(raw_segment, "text", "")).strip()
        if not text:
            continue
        segments = (
            *segments,
            TranscriptionSegment(
                start_seconds=float(_get_attr(raw_segment, "start", 0.0)),
                end_seconds=float(_get_attr(raw_segment, "end", 0.0)),
                text=text,
            ),
        )
    return segments


def _response_text(response: Any) -> str:
    return str(_get_attr(response, "text", "")).strip()


def _get_attr(value: Any, name: str, default: Any) -> Any:
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _format_timestamp(seconds: float) -> str:
    rounded = max(0, round(seconds))
    hours = rounded // 3600
    minutes = (rounded % 3600) // 60
    remaining_seconds = rounded % 60
    return f"{hours:02d}:{minutes:02d}:{remaining_seconds:02d}"


def _decode_output(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value
