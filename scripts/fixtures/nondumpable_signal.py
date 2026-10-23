"""Die, or keep running, only after this process is no longer dumpable.

Exec resets PR_SET_DUMPABLE, so the disarm has to happen in the process that
receives the fatal signal. RLIMIT_CORE=1 still invokes a pipe core_pattern;
dumpable 0 makes the kernel skip that handler.

Run this file. Do not exec a child after disarm and expect the child to stay
non-dumpable.
"""

from __future__ import annotations

import argparse
import ctypes
import os
import runpy
import signal
import sys

PR_SET_DUMPABLE = 4
_FORWARDED_FLAGS = {"-I", "-E", "-s", "-S", "-B"}


def disarm() -> None:
    """Call prctl(PR_SET_DUMPABLE, 0) in this process."""
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.argtypes = [
        ctypes.c_int,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_ulong,
    ]
    libc.prctl.restype = ctypes.c_int
    if libc.prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) != 0:
        error = ctypes.get_errno()
        raise OSError(error, "prctl PR_SET_DUMPABLE")


def _signal_number(name: str) -> int:
    if not name.startswith("SIG") or name.startswith("SIG_"):
        raise argparse.ArgumentTypeError(name)
    value = getattr(signal, name, None)
    if not isinstance(value, int):
        raise argparse.ArgumentTypeError(name)
    return value


def forward(argv: list[str]) -> None:
    """Run forwarded Python arguments in this already-disarmed process."""
    args = list(argv)
    while args and args[0] in _FORWARDED_FLAGS:
        args.pop(0)
    if not args:
        raise SystemExit("nondumpable helper: missing forwarded Python arguments")
    if args[0] == "-c":
        if len(args) < 2:
            raise SystemExit("nondumpable helper: python -c needs code")
        sys.argv = ["-c", *args[2:]]
        exec(compile(args[1], "<string>", "exec"), {"__name__": "__main__"})
        return
    if args[0].startswith("-"):
        raise SystemExit(
            f"nondumpable helper: unsupported forwarded argument {args[0]}"
        )
    sys.argv = args
    runpy.run_path(args[0], run_name="__main__")


def main(argv: list[str]) -> None:
    if argv[:1] == ["--forward"]:
        disarm()
        forward(argv[1:])
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--signal", type=_signal_number, required=True)
    parser.add_argument("--stdout")
    parser.add_argument("--stderr")
    args = parser.parse_args(argv)
    disarm()
    if args.stdout is not None:
        sys.stdout.write(args.stdout)
        sys.stdout.flush()
    if args.stderr is not None:
        sys.stderr.write(args.stderr)
        sys.stderr.flush()
    # Python ignores SIGXFSZ so a too-large write raises instead of dying.
    # Restore the default disposition or the self-signal returns and we exit 127.
    if args.signal not in {signal.SIGKILL, signal.SIGSTOP}:
        signal.signal(args.signal, signal.SIG_DFL)
    os.kill(os.getpid(), args.signal)
    raise SystemExit(127)


if __name__ == "__main__":
    main(sys.argv[1:])
