import json
from pathlib import Path
from types import SimpleNamespace

from llm.content_ops.cli import build_parser, run
from llm.content_ops.transcription import (
    AudioExtractionSettings,
    FfmpegAudioExtractor,
    OpenAITranscriber,
    TranscriptionResult,
    TranscriptionSegment,
    VideoTranscriptionPipeline,
    format_timestamped_transcript,
)


def test_audio_extractor_builds_ffmpeg_command(tmp_path):
    extractor = FfmpegAudioExtractor(
        settings=AudioExtractionSettings(
            audio_path=tmp_path / "audio.wav",
            ffmpeg_path="ffmpeg",
        )
    )

    result = extractor.create_plan(Path("/tmp/source-video.mp4"))

    assert result.command == (
        "ffmpeg",
        "-y",
        "-i",
        "/tmp/source-video.mp4",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        str(tmp_path / "audio.wav"),
    )


def test_audio_extractor_reports_missing_ffmpeg(tmp_path):
    def missing_runner(command, **kwargs):
        raise FileNotFoundError(command[0])

    extractor = FfmpegAudioExtractor(
        settings=AudioExtractionSettings(audio_path=tmp_path / "audio.wav"),
        runner=missing_runner,
    )

    result = extractor.extract(Path("/tmp/source-video.mp4"))

    assert result.returncode == 127
    assert result.ok is False
    assert "not found" in result.stderr


def test_format_timestamped_transcript():
    transcript = format_timestamped_transcript(
        (
            TranscriptionSegment(start_seconds=0.0, end_seconds=4.2, text="First idea."),
            TranscriptionSegment(start_seconds=4.2, end_seconds=9.8, text="Second idea."),
        )
    )

    assert transcript == (
        "[00:00:00 - 00:00:04] Speaker: First idea.\n"
        "[00:00:04 - 00:00:10] Speaker: Second idea."
    )


def test_openai_transcriber_uses_audio_transcriptions_api(tmp_path):
    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"audio")

    class FakeTranscriptions:
        def __init__(self):
            self.params = None

        def create(self, **params):
            self.params = params
            return SimpleNamespace(
                text="First idea. Second idea.",
                segments=[
                    {"start": 0.0, "end": 4.2, "text": "First idea."},
                    SimpleNamespace(start=4.2, end=9.8, text="Second idea."),
                ],
            )

    fake_transcriptions = FakeTranscriptions()
    fake_client = SimpleNamespace(audio=SimpleNamespace(transcriptions=fake_transcriptions))

    result = OpenAITranscriber(client=fake_client, model="whisper-1").transcribe(audio_path)

    assert result.ok is True
    assert result.provider == "openai"
    assert result.model == "whisper-1"
    assert result.transcript.startswith("[00:00:00 - 00:00:04]")
    assert fake_transcriptions.params["model"] == "whisper-1"
    assert fake_transcriptions.params["response_format"] == "verbose_json"


def test_video_transcription_pipeline_extracts_then_transcribes(tmp_path):
    calls = []

    def fake_runner(command, **kwargs):
        calls.append(command)
        return SimpleNamespace(returncode=0, stdout="ok", stderr="")

    class FakeTranscriber:
        provider = "fake"

        def transcribe(self, audio_path):
            return TranscriptionResult(
                provider="fake",
                model="test",
                transcript="[00:00:00 - 00:00:03] Speaker: Automated transcript.",
                segments=(TranscriptionSegment(0.0, 3.0, "Automated transcript."),),
            )

    pipeline = VideoTranscriptionPipeline(
        extractor=FfmpegAudioExtractor(
            settings=AudioExtractionSettings(audio_path=tmp_path / "audio.wav"),
            runner=fake_runner,
        ),
        transcriber=FakeTranscriber(),
    )

    result = pipeline.transcribe(Path("/tmp/source-video.mp4"))

    assert result.ok is True
    assert calls[0][0] == "ffmpeg"
    assert "Automated transcript" in result.transcript


def test_cli_can_transcribe_from_video_before_planning(tmp_path, monkeypatch, capsys):
    video_path = tmp_path / "source-video.mp4"
    video_path.write_bytes(b"video")

    class FakePipeline:
        def transcribe(self, source_video):
            assert source_video == video_path
            return SimpleNamespace(
                ok=True,
                transcript="[00:00:00 - 00:00:03] Speaker: Automated transcript with AI agent value.",
                to_dict=lambda: {
                    "ok": True,
                    "transcript": "[00:00:00 - 00:00:03] Speaker: Automated transcript with AI agent value.",
                },
            )

    monkeypatch.setattr("llm.content_ops.cli._build_transcription_pipeline", lambda args: FakePipeline())

    parser = build_parser()
    args = parser.parse_args([
        "--brand",
        "ClipOps",
        "--audience",
        "founder-led B2B companies",
        "--clips",
        "1",
        "--video",
        str(video_path),
        "--transcribe",
    ])

    exit_code = run(args)

    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["transcription"]["ok"] is True
    assert payload["clips"][0]["transcript"].startswith("Automated transcript")


def test_cli_reports_transcription_setup_errors(tmp_path, monkeypatch, capsys):
    video_path = tmp_path / "source-video.mp4"
    video_path.write_bytes(b"video")

    def broken_pipeline(args):
        raise ValueError("OPENAI_API_KEY is required for OpenAI transcription")

    monkeypatch.setattr("llm.content_ops.cli._build_transcription_pipeline", broken_pipeline)

    parser = build_parser()
    args = parser.parse_args([
        "--brand",
        "ClipOps",
        "--video",
        str(video_path),
        "--transcribe",
    ])

    exit_code = run(args)

    assert exit_code == 1
    payload = json.loads(capsys.readouterr().out)
    assert payload["transcription"]["ok"] is False
    assert "OPENAI_API_KEY" in payload["transcription"]["error"]
