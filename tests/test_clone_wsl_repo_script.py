from pathlib import Path


SCRIPT_PATH = Path(__file__).parent.parent / "scripts" / "Clone-WslRepo.ps1"


def test_wsl_logging_uses_posix_date():
    content = SCRIPT_PATH.read_text()
    assert r"ts=\$(date -Is)" in content
    assert "Get-date -Is" not in content
