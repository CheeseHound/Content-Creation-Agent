# Shortform Content Ops Agent

The shortform content ops agent turns a long-form transcript into a reusable
content operations plan:

- ranked clip opportunities with timestamps
- hooks, captions, titles, and edit notes
- a daily posting calendar
- follow-up script ideas
- an analytics loop for deciding what to make next

It is intentionally offline-first. The first pass uses deterministic transcript
heuristics so the pipeline can run without API keys, then an LLM or video
editing backend can be added later for richer creative review and rendering.

For the SaaS architecture target, see
`docs/business/shortform-content-ops-saas.md`. The production workflow contract
is implemented in `src/llm/content_ops/platform.py` and covers subscription
gates, R2/S3 storage keys, BullMQ-ready queue payloads, and render job state
transitions.

## Run It

```bash
content-ops-agent transcript.txt \
  --brand "ClipOps" \
  --audience "founder-led B2B companies" \
  --clips 5 \
  --start-date 2026-05-25 \
  --pretty
```

To automate the transcript from a video, install FFmpeg, set `OPENAI_API_KEY`,
and use `--transcribe` without a transcript argument:

```bash
content-ops-agent \
  --brand "ClipOps" \
  --audience "founder-led B2B companies" \
  --clips 5 \
  --video source-video.mp4 \
  --transcribe \
  --transcript-out transcript.txt \
  --pretty
```

The transcription pipeline extracts a mono 16 kHz WAV with FFmpeg, sends it to
the configured speech-to-text provider, formats timestamped transcript lines,
then continues into clip planning. The default provider is OpenAI with
`whisper-1`, and the model can be changed with `--transcription-model`.

To generate FFmpeg render jobs for an uploaded video, pass `--video` and an
output directory:

```bash
content-ops-agent transcript.txt \
  --brand "ClipOps" \
  --audience "founder-led B2B companies" \
  --clips 5 \
  --video source-video.mp4 \
  --output-dir clips \
  --pretty
```

This emits a `render_manifest` with one FFmpeg command per selected clip. The
commands create vertical 1080x1920 clips, crop to a 9:16 frame, preserve audio,
and composite a styled PNG hook card near the top of the video.

The PNG overlay path avoids depending on FFmpeg's `drawtext` filter. If a
system cannot render image overlays, rendering automatically retries the same
clip without the overlay instead of failing the job.

To actually render clips, install FFmpeg and add `--render`:

```bash
content-ops-agent transcript.txt \
  --brand "ClipOps" \
  --audience "founder-led B2B companies" \
  --clips 5 \
  --video source-video.mp4 \
  --output-dir clips \
  --render \
  --pretty
```

If FFmpeg is missing, the command returns `render_results` with `returncode:
127` and an `ffmpeg not found` error for each attempted clip.

During local development without installing the package, run the module from
the repo root:

```bash
PYTHONPATH=src python3 -m llm.content_ops.cli transcript.txt \
  --brand "ClipOps" \
  --audience "founder-led B2B companies" \
  --clips 5 \
  --pretty
```

## Transcript Format

Timestamped transcript lines are preferred:

```text
[00:00:18 - 00:00:45] Founder: A full-time editor can cost a couple thousand dollars per month.
```

Plain paragraphs also work. When timestamps are missing, the agent estimates
clip windows from word count.

## Output Shape

The CLI writes JSON with these top-level keys:

- `brand_name`
- `audience`
- `clips`
- `calendar`
- `script_ideas`
- `analytics_plan`

Each clip includes its timestamp range, score, hook, caption, platform fit,
rationale, and edit notes. This is the handoff format for the FFmpeg renderer,
a future scheduler, or a client dashboard.

When `--video` is provided, the output also includes:

- `render_manifest` — planned FFmpeg jobs
- `render_results` — execution results when `--render` is used, otherwise `null`
- `overlay_path` on each render job — generated PNG hook card used by FFmpeg

When `--transcribe` is provided, the output also includes:

- `transcription` — audio extraction details, transcript text, speech-to-text
  provider metadata, and any setup/runtime errors
