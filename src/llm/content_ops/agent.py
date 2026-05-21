"""Offline-first short-form content operations agent.

The agent turns a long-form transcript into a ranked content pipeline: clip
moments, hooks, captions, posting slots, script ideas, and metrics to watch.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
import re
from typing import Any


DEFAULT_PLATFORMS = ("tiktok", "instagram_reels", "youtube_shorts")
WORDS_PER_SECOND = 2.6

HOOK_SIGNALS: dict[str, int] = {
    "$": 12,
    "ai": 8,
    "agent": 8,
    "analyzing": 8,
    "analytics": 10,
    "better": 4,
    "charge": 10,
    "clips": 8,
    "company": 6,
    "content": 6,
    "cost": 10,
    "daily": 12,
    "dollars": 10,
    "editor": 8,
    "eliminate": 8,
    "friction": 8,
    "full-time": 10,
    "hook": 10,
    "ideas": 5,
    "month": 8,
    "publish": 7,
    "recurring": 14,
    "scripts": 8,
    "solution": 6,
    "thousand": 10,
    "works": 5,
}

STOPWORDS = {
    "about",
    "again",
    "because",
    "companies",
    "company",
    "content",
    "could",
    "every",
    "from",
    "have",
    "into",
    "just",
    "like",
    "need",
    "over",
    "that",
    "their",
    "there",
    "this",
    "video",
    "what",
    "when",
    "where",
    "which",
    "with",
    "would",
    "your",
}

TIMESTAMP_RE = re.compile(
    r"^\s*\[?(?P<start>\d{1,2}:\d{2}(?::\d{2})?)\s*(?:-|-->|->|to)\s*"
    r"(?P<end>\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(?P<body>.*)$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class TranscriptSegment:
    start_seconds: int
    end_seconds: int
    text: str
    speaker: str | None = None

    @property
    def duration_seconds(self) -> int:
        return max(0, self.end_seconds - self.start_seconds)

    def to_dict(self) -> dict[str, Any]:
        return {
            "start_seconds": self.start_seconds,
            "end_seconds": self.end_seconds,
            "speaker": self.speaker,
            "text": self.text,
        }


@dataclass(frozen=True)
class ShortformContentRequest:
    transcript: str
    brand_name: str
    audience: str = "target customers"
    platforms: tuple[str, ...] = DEFAULT_PLATFORMS
    clip_count: int = 5
    start_date: date | None = None


@dataclass(frozen=True)
class ClipCandidate:
    id: str
    title: str
    hook: str
    caption: str
    start_seconds: int
    end_seconds: int
    transcript: str
    score: int
    platforms: tuple[str, ...]
    rationale: tuple[str, ...]
    edit_notes: tuple[str, ...]

    @property
    def duration_seconds(self) -> int:
        return max(0, self.end_seconds - self.start_seconds)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "hook": self.hook,
            "caption": self.caption,
            "start_seconds": self.start_seconds,
            "end_seconds": self.end_seconds,
            "duration_seconds": self.duration_seconds,
            "transcript": self.transcript,
            "score": self.score,
            "platforms": list(self.platforms),
            "rationale": list(self.rationale),
            "edit_notes": list(self.edit_notes),
        }


@dataclass(frozen=True)
class CalendarItem:
    publish_date: date
    clip_id: str
    platform: str
    angle: str
    status: str = "draft_ready"

    def to_dict(self) -> dict[str, Any]:
        return {
            "publish_date": self.publish_date.isoformat(),
            "clip_id": self.clip_id,
            "platform": self.platform,
            "angle": self.angle,
            "status": self.status,
        }


@dataclass(frozen=True)
class AnalyticsPlan:
    metrics: tuple[str, ...]
    experiments: tuple[str, ...]
    review_questions: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "metrics": list(self.metrics),
            "experiments": list(self.experiments),
            "review_questions": list(self.review_questions),
        }


@dataclass(frozen=True)
class ShortformContentPlan:
    brand_name: str
    audience: str
    clips: tuple[ClipCandidate, ...]
    calendar: tuple[CalendarItem, ...]
    script_ideas: tuple[str, ...]
    analytics_plan: AnalyticsPlan

    def to_dict(self) -> dict[str, Any]:
        return {
            "brand_name": self.brand_name,
            "audience": self.audience,
            "clips": [clip.to_dict() for clip in self.clips],
            "calendar": [item.to_dict() for item in self.calendar],
            "script_ideas": list(self.script_ideas),
            "analytics_plan": self.analytics_plan.to_dict(),
        }


class ShortformContentAgent:
    """Plan a recurring short-form content operation from long-form transcripts."""

    def analyze(self, request: ShortformContentRequest) -> ShortformContentPlan:
        if not request.transcript.strip():
            raise ValueError("transcript is required")
        if not request.brand_name.strip():
            raise ValueError("brand_name is required")
        if request.clip_count < 1:
            raise ValueError("clip_count must be at least 1")

        segments = parse_transcript(request.transcript)
        candidates = _rank_candidates(_build_candidates(segments, request), request.clip_count)
        calendar = _build_calendar(candidates, request)
        return ShortformContentPlan(
            brand_name=request.brand_name.strip(),
            audience=request.audience.strip() or "target customers",
            clips=candidates,
            calendar=calendar,
            script_ideas=_build_script_ideas(candidates, request),
            analytics_plan=_build_analytics_plan(candidates),
        )


def parse_transcript(transcript: str) -> tuple[TranscriptSegment, ...]:
    """Parse timestamped or paragraph transcripts into immutable segments."""

    lines = tuple(line.strip() for line in transcript.splitlines() if line.strip())
    if not lines:
        return ()

    timestamped = tuple(_parse_timestamped_line(line) for line in lines)
    if all(segment is not None for segment in timestamped):
        return tuple(segment for segment in timestamped if segment is not None)

    paragraphs = tuple(paragraph.strip() for paragraph in re.split(r"\n\s*\n", transcript) if paragraph.strip())
    return _estimate_segments(paragraphs or lines)


def _parse_timestamped_line(line: str) -> TranscriptSegment | None:
    match = TIMESTAMP_RE.match(line)
    if not match:
        return None

    start_seconds = _parse_timestamp(match.group("start"))
    end_seconds = _parse_timestamp(match.group("end"))
    body = match.group("body").strip()
    speaker, text = _split_speaker(body)
    duration = max(8, _estimate_duration(text))
    safe_end = end_seconds if end_seconds > start_seconds else start_seconds + duration

    return TranscriptSegment(
        start_seconds=start_seconds,
        end_seconds=safe_end,
        speaker=speaker,
        text=text,
    )


def _parse_timestamp(value: str) -> int:
    parts = tuple(int(part) for part in value.split(":"))
    if len(parts) == 2:
        minutes, seconds = parts
        return minutes * 60 + seconds
    hours, minutes, seconds = parts
    return hours * 3600 + minutes * 60 + seconds


def _split_speaker(body: str) -> tuple[str | None, str]:
    if ":" not in body:
        return None, body

    possible_speaker, text = body.split(":", 1)
    speaker_words = possible_speaker.split()
    if 1 <= len(speaker_words) <= 5 and len(possible_speaker) <= 40:
        return possible_speaker.strip(), text.strip()
    return None, body


def _estimate_segments(text_blocks: tuple[str, ...]) -> tuple[TranscriptSegment, ...]:
    segments: tuple[TranscriptSegment, ...] = ()
    cursor = 0
    for text in text_blocks:
        duration = _estimate_duration(text)
        segment = TranscriptSegment(
            start_seconds=cursor,
            end_seconds=cursor + duration,
            text=" ".join(text.split()),
        )
        segments = (*segments, segment)
        cursor = segment.end_seconds
    return segments


def _estimate_duration(text: str) -> int:
    word_count = len(_words(text))
    return max(12, round(word_count / WORDS_PER_SECOND))


def _build_candidates(
    segments: tuple[TranscriptSegment, ...],
    request: ShortformContentRequest,
) -> tuple[ClipCandidate, ...]:
    windows = _candidate_windows(segments)
    return tuple(_make_candidate(index + 1, window, request) for index, window in enumerate(windows))


def _candidate_windows(segments: tuple[TranscriptSegment, ...]) -> tuple[tuple[TranscriptSegment, ...], ...]:
    windows: tuple[tuple[TranscriptSegment, ...], ...] = ()
    seen: set[tuple[int, int]] = set()

    for index, segment in enumerate(segments):
        for size in (1, 2, 3):
            window = segments[index : index + size]
            if not window:
                continue
            duration = window[-1].end_seconds - window[0].start_seconds
            if size > 1 and duration > 90:
                continue
            key = (window[0].start_seconds, window[-1].end_seconds)
            if key in seen:
                continue
            seen = {*seen, key}
            windows = (*windows, window)
    return windows


def _make_candidate(
    index: int,
    window: tuple[TranscriptSegment, ...],
    request: ShortformContentRequest,
) -> ClipCandidate:
    transcript = " ".join(segment.text for segment in window).strip()
    score, rationale = _score_clip(transcript, window[-1].end_seconds - window[0].start_seconds)
    hook = _make_hook(transcript, request.audience)
    return ClipCandidate(
        id=f"clip-{index:02d}",
        title=_make_title(transcript),
        hook=hook,
        caption=_make_caption(hook, transcript, request),
        start_seconds=window[0].start_seconds,
        end_seconds=window[-1].end_seconds,
        transcript=transcript,
        score=score,
        platforms=_platform_fit(request.platforms, window[-1].end_seconds - window[0].start_seconds),
        rationale=rationale,
        edit_notes=_make_edit_notes(transcript, hook),
    )


def _score_clip(text: str, duration_seconds: int) -> tuple[int, tuple[str, ...]]:
    lower_text = text.lower()
    signal_score = sum(weight for signal, weight in HOOK_SIGNALS.items() if signal in lower_text)
    number_score = 16 if re.search(r"[$]?\d+|hundred|thousand|million", lower_text) else 0
    contrast_score = 10 if re.search(r"\bnot\b|\binstead\b|\bbut\b|\bversus\b", lower_text) else 0
    duration_score = _duration_score(duration_seconds)
    raw_score = min(100, 22 + signal_score + number_score + contrast_score + duration_score)
    rationale = _rationale(lower_text, duration_seconds)
    return raw_score, rationale


def _duration_score(duration_seconds: int) -> int:
    if 25 <= duration_seconds <= 70:
        return 18
    if 18 <= duration_seconds <= 90:
        return 12
    if 10 <= duration_seconds < 18:
        return 6
    return 2


def _rationale(lower_text: str, duration_seconds: int) -> tuple[str, ...]:
    reasons: tuple[str, ...] = ()
    if any(term in lower_text for term in ("cost", "dollars", "thousand", "$", "charge")):
        reasons = (*reasons, "Contains concrete business value or pricing tension.")
    if any(term in lower_text for term in ("daily", "recurring", "month")):
        reasons = (*reasons, "Frames the offer as an ongoing operational need.")
    if any(term in lower_text for term in ("hook", "scripts", "analytics", "analyzing")):
        reasons = (*reasons, "Extends beyond editing into content strategy and learning.")
    if 25 <= duration_seconds <= 70:
        reasons = (*reasons, "Fits a strong short-form runtime window.")
    return reasons or ("Clear standalone idea that can be clipped without extra setup.",)


def _make_hook(text: str, audience: str) -> str:
    lower_text = text.lower()
    if any(term in lower_text for term in ("cost", "dollars", "thousand", "$", "full-time editor")):
        return "The content hire replacement hiding in one long video"
    if "analytics" in lower_text or "analyzing" in lower_text:
        return "The clip is not finished when it is posted"
    if "daily" in lower_text or "recurring" in lower_text:
        return "Short-form content is a recurring operation, not a one-off edit"
    if "ai agent" in lower_text:
        return "An AI agent can turn one recording into a content pipeline"

    strongest_sentence = _strongest_sentence(text)
    if strongest_sentence:
        return _trim_sentence(strongest_sentence, 13)
    return f"A sharper content system for {audience}"


def _make_title(text: str) -> str:
    lower_text = text.lower()
    if "full-time editor" in lower_text or "cost" in lower_text:
        return "Replace Editing Friction"
    if "analytics" in lower_text or "analyzing" in lower_text:
        return "Build The Feedback Loop"
    if "ai agent" in lower_text:
        return "One Video, Many Assets"
    if "daily" in lower_text:
        return "The Daily Content System"
    return _title_from_keywords(text)


def _title_from_keywords(text: str) -> str:
    keywords = tuple(
        word.capitalize()
        for word in _words(text.lower())
        if len(word) > 3 and word not in STOPWORDS
    )
    return " ".join(keywords[:4]) or "Shortform Clip"


def _make_caption(hook: str, text: str, request: ShortformContentRequest) -> str:
    summary = _trim_sentence(_strongest_sentence(text) or text, 24)
    return (
        f"{hook}. {summary}. "
        f"For {request.audience}, this turns long-form footage into a repeatable content operation."
    )


def _make_edit_notes(text: str, hook: str) -> tuple[str, ...]:
    lower_text = text.lower()
    notes = (
        f"Open with on-screen text: {hook}.",
        "Use burned-in captions with phrase-level emphasis on the concrete numbers.",
        "Cut pauses aggressively and keep the first three seconds visually active.",
    )
    if "analytics" in lower_text or "analyzing" in lower_text:
        return (*notes, "End with a simple retention or lead-quality metric on screen.")
    if any(term in lower_text for term in ("dollars", "thousand", "$", "charge")):
        return (*notes, "Show a cost comparison overlay against a full-time editor.")
    return notes


def _platform_fit(platforms: tuple[str, ...], duration_seconds: int) -> tuple[str, ...]:
    preferred = tuple(platform for platform in platforms if platform)
    if duration_seconds > 70:
        return tuple(platform for platform in preferred if platform in {"youtube_shorts", "linkedin"}) or preferred
    return preferred or DEFAULT_PLATFORMS


def _rank_candidates(
    candidates: tuple[ClipCandidate, ...],
    clip_count: int,
) -> tuple[ClipCandidate, ...]:
    ranked = tuple(sorted(candidates, key=lambda clip: (-clip.score, clip.start_seconds, clip.end_seconds)))
    selected: tuple[ClipCandidate, ...] = ()

    for candidate in ranked:
        overlaps_existing = any(_overlap_ratio(candidate, clip) > 0.5 for clip in selected)
        repeats_angle = any(candidate.hook == clip.hook or candidate.title == clip.title for clip in selected)
        if overlaps_existing or repeats_angle:
            continue
        selected = (*selected, candidate)
        if len(selected) == clip_count:
            return selected

    for candidate in ranked:
        if candidate in selected:
            continue
        overlaps_existing = any(_overlap_ratio(candidate, clip) > 0.7 for clip in selected)
        if overlaps_existing:
            continue
        selected = (*selected, candidate)
        if len(selected) == clip_count:
            return selected

    return selected


def _overlap_ratio(left: ClipCandidate, right: ClipCandidate) -> float:
    overlap_start = max(left.start_seconds, right.start_seconds)
    overlap_end = min(left.end_seconds, right.end_seconds)
    overlap = max(0, overlap_end - overlap_start)
    shortest = max(1, min(left.duration_seconds, right.duration_seconds))
    return overlap / shortest


def _build_calendar(
    clips: tuple[ClipCandidate, ...],
    request: ShortformContentRequest,
) -> tuple[CalendarItem, ...]:
    first_date = request.start_date or date.today()
    return tuple(
        CalendarItem(
            publish_date=first_date + timedelta(days=index),
            clip_id=clip.id,
            platform=clip.platforms[index % len(clip.platforms)],
            angle=clip.title,
        )
        for index, clip in enumerate(clips)
    )


def _build_script_ideas(
    clips: tuple[ClipCandidate, ...],
    request: ShortformContentRequest,
) -> tuple[str, ...]:
    top_titles = tuple(clip.title for clip in clips[:3])
    base = (
        f"Cost breakdown: full-time editor versus {request.brand_name}'s AI-assisted content operation.",
        "One long-form recording turned into a week of short-form posts.",
        "The analytics loop: which hooks, topics, lengths, and formats should be doubled down on.",
        f"A founder-led script for {request.audience}: problem, proof, process, offer.",
    )
    derived = tuple(f"Follow-up angle: {title.lower()}." for title in top_titles)
    return _dedupe_preserve((*base, *derived))


def _build_analytics_plan(clips: tuple[ClipCandidate, ...]) -> AnalyticsPlan:
    strongest_hooks = _dedupe_preserve(tuple(clip.hook for clip in clips[:3]))
    return AnalyticsPlan(
        metrics=(
            "three_second_hold",
            "average_watch_time",
            "completion_rate",
            "rewatches",
            "saves",
            "qualified_comments_or_dms",
        ),
        experiments=(
            "Test cost-led hooks against process-led hooks.",
            "Compare 25-35 second cuts with 45-60 second cuts.",
            "Rotate founder POV captions against direct offer captions.",
        ),
        review_questions=(
            "Which opening line held viewers past three seconds?",
            "Which clip topic produced comments or sales conversations?",
            "Which platform rewarded the same source idea most efficiently?",
            *tuple(f"Did this hook earn a follow-up cut: {hook}?" for hook in strongest_hooks),
        ),
    )


def _dedupe_preserve(values: tuple[str, ...]) -> tuple[str, ...]:
    deduped: tuple[str, ...] = ()
    seen: frozenset[str] = frozenset()
    for value in values:
        if value in seen:
            continue
        deduped = (*deduped, value)
        seen = frozenset((*seen, value))
    return deduped


def _strongest_sentence(text: str) -> str:
    sentences = tuple(sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", text) if sentence.strip())
    if not sentences:
        return text.strip()
    return max(sentences, key=lambda sentence: _score_clip(sentence, _estimate_duration(sentence))[0])


def _trim_sentence(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text.strip().rstrip(".")
    return " ".join(words[:max_words]).strip().rstrip(".,;:")


def _words(text: str) -> tuple[str, ...]:
    return tuple(re.findall(r"[A-Za-z0-9$]+(?:-[A-Za-z0-9$]+)?", text))
