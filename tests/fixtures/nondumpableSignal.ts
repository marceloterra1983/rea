import { fileURLToPath } from "node:url";

/** Python can call prctl. Node's standard library cannot. */
export const NONDUMPABLE_PYTHON = "/usr/bin/python3";

/**
 * Process that disarms itself and then signals itself.
 * Exec would reset dumpable, so this program has to be the process that dies.
 */
export const nondumpableSignalProgram = fileURLToPath(
  new URL("../../scripts/fixtures/nondumpable_signal.py", import.meta.url),
);

/** Arguments for NONDUMPABLE_PYTHON. The signal name is the kernel signal. */
export const nondumpableSignalArguments = (
  signalName: string,
  streams?: { readonly stdout?: string; readonly stderr?: string },
): readonly string[] => [
  "-I",
  nondumpableSignalProgram,
  "--signal",
  signalName,
  ...(streams?.stdout === undefined ? [] : ["--stdout", streams.stdout]),
  ...(streams?.stderr === undefined ? [] : ["--stderr", streams.stderr]),
];
