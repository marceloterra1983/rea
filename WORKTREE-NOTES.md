# improve/zod-pin

Dispatcher kept this branch. The plan's `advisor/001-zod-array-advisory` branch was not created. `plans/README.md` was not edited; the dispatcher maintains that index.

## Change

Exact production pin `zod` `4.4.3` → `4.6.7` in `package.json` and `package-lock.json`. No range operator. The VitePress `vite` `6.4.4` override is unchanged. No root `zod` override was required: `npm ls zod --all` printed eight copies, each `4.6.7`.

`src/domain/process/processScenario.ts` was not edited. `arguments`, `filesystem_observation_paths`, `events`, and `patterns` still have no `.max()`.

`src/domain/process/processScenario.test.ts` rejects three short `events` whose `type` is outside the discriminated union. `safeParse` fails and `error.issues.length` is in `1..10`. No large array and no memory-exhaustion assertion.

## Advisory

Before the pin, `npm audit --omit=dev --json` (npm 11.16.0, Node 24.18.0) reported GHSA-mrhx-c7xc-m3w5 on `zod` with `fixAvailable`: `{ "name": "zod", "version": "4.6.7", "isSemVerMajor": false }`.

After the pin, the same report has no `vulnerabilities.zod`. `fast-uri` remains (moderate/low) and was left alone. `npm audit` still exits 1 because of that finding, so the plan's `execSync("npm audit ...")` wrapper throws before it can print `zod advisory absent`. Parsing the audit JSON with a non-throwing spawn shows `zod advisory absent` and remaining `fast-uri` only. `npm audit fix` was not run.

## Verification

- `npm run typecheck` exit 0
- `npm run test:focused` on `processScenario.test.ts`, `workflowInputContracts.test.ts`, `toolInputReferences.test.ts`, and `toolOutputReferences.test.ts`: exit 0, stderr `Focused tests:` plus those four paths, 45 tests passed
- `git diff 6996cb7b4 -- src/domain/process/processScenario.ts` empty
- No push

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
