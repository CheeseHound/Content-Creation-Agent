import json
from datetime import date

import pytest

from llm.content_ops import (
    ShortformContentAgent,
    ShortformContentRequest,
    parse_transcript,
)
from llm.content_ops.cli import build_parser, run


SAMPLE_TRANSCRIPT = """
[00:00:00 - 00:00:18] Founder: Most companies do not need another AI editing tool. They need a daily content system.
[00:00:18 - 00:00:45] Founder: A full-time editor can cost a couple thousand dollars per month, and the workflow still depends on someone planning hooks, posting, and analyzing results.
[00:00:45 - 00:01:11] Founder: The practical solution is an AI agent that takes a ten minute video, finds the strongest moments, writes the hooks, prepares captions, and schedules the clips.
[00:01:11 - 00:01:36] Founder: That lets an agency charge one thousand to fifteen hundred dollars per month for recurring content operations instead of selling one-off edits.
[00:01:36 - 00:01:56] Founder: The analytics loop matters too. You need to learn which hooks, topics, lengths, and formats lead to retention and qualified leads.
""".strip()


def test_parse_transcript_reads_timestamped_segments():
    segments = parse_transcript(SAMPLE_TRANSCRIPT)

    assert len(segments) == 5
    assert segments[1].start_seconds == 18
    assert segments[1].end_seconds == 45
    assert segments[1].speaker == "Founder"
    assert "full-time editor" in segments[1].text


def test_shortform_agent_ranks_clips_and_generates_publish_collateral():
    agent = ShortformContentAgent()
    result = agent.analyze(
        ShortformContentRequest(
            transcript=SAMPLE_TRANSCRIPT,
            brand_name="ClipOps",
            audience="B2B service businesses",
            platforms=("tiktok", "instagram_reels", "youtube_shorts", "linkedin"),
            clip_count=3,
            start_date=date(2026, 5, 25),
        )
    )

    assert result.brand_name == "ClipOps"
    assert len(result.clips) == 3
    assert result.clips[0].score >= result.clips[1].score
    assert result.clips[0].hook
    assert result.clips[0].caption
    assert result.clips[0].edit_notes
    assert result.clips[0].start_seconds < result.clips[0].end_seconds
    assert len(result.calendar) == 3
    assert result.calendar[0].publish_date.isoformat() == "2026-05-25"
    assert result.calendar[0].clip_id == result.clips[0].id
    assert result.analytics_plan.metrics[:3] == ("three_second_hold", "average_watch_time", "completion_rate")
    assert len({clip.hook for clip in result.clips}) == len(result.clips)
    assert len(set(result.script_ideas)) == len(result.script_ideas)
    assert len(result.script_ideas) >= 3


def test_shortform_agent_rejects_empty_transcripts():
    agent = ShortformContentAgent()

    with pytest.raises(ValueError, match="transcript"):
        agent.analyze(ShortformContentRequest(transcript="   ", brand_name="ClipOps"))


def test_cli_outputs_json_plan(tmp_path, capsys):
    transcript_path = tmp_path / "transcript.txt"
    transcript_path.write_text(SAMPLE_TRANSCRIPT, encoding="utf-8")
    parser = build_parser()
    args = parser.parse_args([
        str(transcript_path),
        "--brand",
        "ClipOps",
        "--audience",
        "founder-led B2B companies",
        "--clips",
        "2",
        "--start-date",
        "2026-05-25",
    ])

    exit_code = run(args)

    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["brand_name"] == "ClipOps"
    assert len(payload["clips"]) == 2
    assert payload["calendar"][0]["publish_date"] == "2026-05-25"
