"""Pin the heuristic that recovers from Engineer double-escape failures.

When the Engineer emits ``artifacts[].content`` as a string where every
newline is encoded as ``\\n`` (two literal characters) instead of ``\n``
(JSON-decoded newline), every gate downstream silently degrades. The
heuristic unescape is conservative: it only fires on the unambiguous
signature (zero real newlines + at least one literal ``\\n``)."""

from app import _unescape_doubly_escaped_artifact_content


def test_double_escaped_package_json_is_recovered():
    """The exact bug shape we observed in the Markdown previewer run."""
    bad = '{\\n  "name": "markdown-previewer",\\n  "version": "1.0.0"\\n}'
    out = _unescape_doubly_escaped_artifact_content("package.json", bad)
    assert "\n" in out
    assert "\\n" not in out
    # Should be parseable JSON after recovery.
    import json
    parsed = json.loads(out)
    assert parsed["name"] == "markdown-previewer"


def test_well_formed_content_is_returned_unchanged():
    """If content already has real newlines, do nothing."""
    good = '{\n  "name": "ok"\n}'
    assert _unescape_doubly_escaped_artifact_content("package.json", good) == good


def test_content_without_literal_backslash_n_is_returned_unchanged():
    """No double-escape signature, no action."""
    text = "single-line string with no newlines anywhere"
    assert _unescape_doubly_escaped_artifact_content("notes.txt", text) == text


def test_empty_content_is_returned_unchanged():
    assert _unescape_doubly_escaped_artifact_content("any.txt", "") == ""


def test_content_with_real_newlines_AND_literal_backslash_n_is_left_alone():
    """A README or doc that legitimately documents ``\\n`` is preserved —
    the heuristic requires ZERO real newlines to fire."""
    doc = "Line one\nLine two mentions \\n as text\nLine three"
    out = _unescape_doubly_escaped_artifact_content("README.md", doc)
    # Should be untouched because real newlines exist.
    assert out == doc
    assert "\\n" in out  # literal sequence preserved


def test_other_escape_sequences_in_double_escaped_content_are_decoded():
    """unicode_escape decodes \\t, \\r, \\" as well — that's the right
    behavior when the content is unambiguously double-escaped."""
    bad = 'col1\\tcol2\\tcol3\\nrow1a\\trow1b\\trow1c'
    out = _unescape_doubly_escaped_artifact_content("data.tsv", bad)
    assert "\n" in out
    assert "\t" in out
    assert "\\n" not in out
    assert "\\t" not in out
