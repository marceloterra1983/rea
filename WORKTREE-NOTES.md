# improve/prlimit-clamp

Dispatcher kept this branch (`improve/prlimit-clamp`, base `6996cb7b4`). Plan
002's `advisor/002-firmware-wakaru-prlimit-clamp` checkout and the
`plans/README.md` status row were not applied; the dispatcher maintains the
index.

Firmware and Wakaru now read inherited Linux limits and launch through
`prlimitArgumentVector`. Configured ceilings stay 1 GiB. Firmware file size
still follows `outputBudget.bytes` or `FIRMWARE_LIMITS.reportBytes`. Wakaru
file size stays `RECOVERY_LIMITS.outputBytes`. CPU stays 120 seconds. Core
stays the helper's paired 1 and 1. A limits read failure is
`AnalysisCapabilityUnavailableError` and does not launch. `LinuxResourceLimits.ts`,
the EVM soft-only argv, Pcap, `PR_SET_DUMPABLE`, and the public Wakaru 1 GiB
ceiling text were not edited.

Command tests compare the spawn argv with `prlimitArgumentVector` for the
injected ceilings and lock the address, file, and CPU pairs as literals. They
do not spell a core option, so `rg -- '--core=1'` under `src/firmware` and
`src/javascript/recovery` stays empty. Wakaru has no output-budget branch, so
the configured `outputBytes` request and the clamped argv share one test; the
read failure is the other.

Not run, and not updated (out of plan scope):
`tests/boundary/firmware/firmwareIntegration.test.ts` still expects the bare
element `--as=1073741824` inside the full limiter argv recorded by
`tests/fixtures/firmware/provider.ts`. No firmware, Wakaru, sigrok, or tshark
process was run. Generated catalogs were not regenerated.

Verification on this worktree: `npm run typecheck` exit 0;
`npm run verify:architecture-guards` exit 0 (`Architecture guards passed`);
focused tests for the two command files and `LinuxResourceLimits.test.ts`
exit 0 (21 passed). `rg` for `zero core-dump` and `--core=1` on the plan
paths exited 1 with no matches.
