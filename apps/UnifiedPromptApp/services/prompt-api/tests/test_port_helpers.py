"""Tests for port-availability and port-owner helpers in app.py."""
import socket
import sys
import pytest

import app as app_module


# ---------------------------------------------------------------------------
# _is_port_available
# ---------------------------------------------------------------------------

def test_is_port_available_returns_true_for_free_port():
    """A port that nothing is bound to should be reported as available."""
    # Bind to 0 to get an OS-assigned free port, then release it and verify.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        free_port = probe.getsockname()[1]
    # Port is now released; it should be available.
    assert app_module._is_port_available(free_port, "127.0.0.1") is True


def test_is_port_available_returns_false_for_occupied_port():
    """A port held by a listening socket must not be reported as available."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as srv:
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        occupied_port = srv.getsockname()[1]
        assert app_module._is_port_available(occupied_port, "127.0.0.1") is False


# ---------------------------------------------------------------------------
# _get_port_owner
# ---------------------------------------------------------------------------

def test_get_port_owner_returns_string():
    """_get_port_owner must always return a non-empty string."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as srv:
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        port = srv.getsockname()[1]
        owner = app_module._get_port_owner(port)
    assert isinstance(owner, str)
    assert len(owner) > 0


def test_get_port_owner_unknown_for_free_port():
    """For a port nobody is listening on, the function must still return a string."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        free_port = probe.getsockname()[1]
    # Port is released; owner should gracefully return something (may be "unknown process")
    owner = app_module._get_port_owner(free_port)
    assert isinstance(owner, str)


# ---------------------------------------------------------------------------
# _find_available_port
# ---------------------------------------------------------------------------

def test_find_available_port_returns_free_port():
    """Should return a port that is actually bindable."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        start = probe.getsockname()[1]
    # start is now free
    found = app_module._find_available_port(start, max_attempts=5, host="127.0.0.1")
    assert found >= start
    # Confirm it really is free
    assert app_module._is_port_available(found, "127.0.0.1") is True


def test_find_available_port_skips_busy_port(capsys):
    """When the first port is busy, the next free one is returned with a warning."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as busy:
        busy.bind(("127.0.0.1", 0))
        busy.listen(1)
        busy_port = busy.getsockname()[1]

        found = app_module._find_available_port(busy_port, max_attempts=10, host="127.0.0.1")

    assert found != busy_port
    captured = capsys.readouterr()
    # A warning about the busy port should appear on stderr
    assert str(busy_port) in captured.err
    assert "WARNING" in captured.err or "in use" in captured.err


def test_find_available_port_raises_when_no_port_available():
    """RuntimeError is raised when every port in the range is occupied."""
    # Hold a block of consecutive ports
    sockets = []
    start_port = None
    num_ports = 3
    try:
        for _ in range(num_ports):
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.bind(("127.0.0.1", 0))
            s.listen(1)
            if start_port is None:
                start_port = s.getsockname()[1]
            sockets.append(s)

        # We only occupied num_ports ports but they aren't guaranteed to be
        # consecutive, so just verify the error is raised when max_attempts=1
        # on a known busy port.
        with pytest.raises(RuntimeError):
            app_module._find_available_port(
                sockets[0].getsockname()[1],
                max_attempts=1,
                host="127.0.0.1",
            )
    finally:
        for s in sockets:
            s.close()
