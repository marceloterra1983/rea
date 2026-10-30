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
