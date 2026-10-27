import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import {
  NONDUMPABLE_PYTHON,
  nondumpableSignalProgram,
} from "../../fixtures/nondumpableSignal.js";

const coredumpctl = spawnSync("coredumpctl", ["--version"], {
  encoding: "utf8",
});

// RLIMIT_CORE=1 still reaches the pipe core handler and the desktop toast.
// Dumpable 0 is what keeps the deliberate signal out of coredumpctl.
it
  .skipIf(process.platform !== "linux" || coredumpctl.status !== 0)
  .each(["SIGXCPU", "SIGXFSZ", "SIGSEGV"])(
  "disarmed %s does not register with systemd-coredump",
  async (signal) => {
    const child = spawnSync(
      NONDUMPABLE_PYTHON,
      ["-I", nondumpableSignalProgram, "--signal", signal, "--stdout", "probe"],
      { encoding: "utf8" },
    );
    expect(child.error).toBeUndefined();
    expect(child.signal).toBe(signal);
    expect(child.pid).toEqual(expect.any(Number));

    const deadline = Date.now() + 2_000;
    let listed = false;
    do {
      const info = spawnSync("coredumpctl", ["info", String(child.pid)], {
        encoding: "utf8",
      });
      const text = `${info.stdout}\n${info.stderr}`;
      if (info.status === 0 || text.includes("Signal:")) {
        listed = true;
        break;
      }
      expect(text).toContain("No coredumps found");
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < deadline);

    expect(listed).toBe(false);
  },
);
