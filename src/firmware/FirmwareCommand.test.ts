import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, it as test } from "vitest";

import { createTestTempDirectory } from "../../tests/fixtures/temporaryDirectory.js";
import { AnalysisCapabilityUnavailableError } from "../domain/analysisErrorCore.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
import { prlimitArgumentVector } from "../process/LinuxResourceLimits.js";
import {
  resolveFirmwareCommand,
  runFirmwareCommand,
  type FirmwareLauncher,
} from "./FirmwareCommand.js";
import { FIRMWARE_LIMITS } from "./FirmwareRelease.js";

const it = test.skipIf(process.platform !== "linux");

test("names the host and tool requirement of an unconfigured engine", async () => {
  const refusal: unknown = await resolveFirmwareCommand(
    {},
    "binwalk",
    "inspect_firmware_regions",
  ).catch((cause: unknown) => cause);

  expect(refusal).toMatchObject({
    _tag: "AnalysisCapabilityUnavailableError",
  });
  if (!(refusal instanceof AnalysisCapabilityUnavailableError))
    throw new Error("Expected a capability refusal");
  expect(projectAnalysisError(refusal)).toMatchObject({
    code: "capability_unavailable",
    message: refusal.reason,
    remediation: { action: refusal.reason },
  });
  expect(refusal.reason).toContain("REA_BINWALK_COMMAND");
});

it("rejects a directory configured as the firmware engine executable", async () => {
  const root = await createTestTempDirectory("rea-firmware-command-");
  const command = join(root, "binwalk");
  const limiter = await executableFixture(root, "prlimit");
  await mkdir(command);

  await expect(
    resolveFirmwareCommand(
      {
        REA_BINWALK_COMMAND: command,
        REA_FIRMWARE_PRLIMIT_COMMAND: limiter,
      },
      "binwalk",
      "inspect_firmware_regions",
    ),
  ).rejects.toMatchObject({
    _tag: "AnalysisCapabilityUnavailableError",
    reason: expect.stringContaining(command),
  });
});

it("classifies an unusable firmware engine as an unavailable capability", async () => {
  const root = await createTestTempDirectory("rea-firmware-command-");
  const command = join(root, "binwalk");
  const limiter = await executableFixture(root, "prlimit");
  await writeFile(command, "not executable", { mode: 0o600 });

  await expect(
    resolveFirmwareCommand(
      {
        REA_BINWALK_COMMAND: command,
        REA_FIRMWARE_PRLIMIT_COMMAND: limiter,
      },
      "binwalk",
      "inspect_firmware_regions",
    ),
  ).rejects.toMatchObject({
    _tag: "AnalysisCapabilityUnavailableError",
    reason: expect.stringContaining(command),
  });
});

it("rejects a directory configured as the resource limiter executable", async () => {
  const root = await createTestTempDirectory("rea-firmware-limiter-");
  const command = await executableFixture(root, "binwalk");
  const limiter = join(root, "prlimit");
  await mkdir(limiter);

  await expect(
    resolveFirmwareCommand(
      {
        REA_BINWALK_COMMAND: command,
        REA_FIRMWARE_PRLIMIT_COMMAND: limiter,
      },
      "binwalk",
      "inspect_firmware_regions",
    ),
  ).rejects.toMatchObject({
    _tag: "AnalysisCapabilityUnavailableError",
    reason: expect.stringContaining(limiter),
  });
});

const executableFixture = async (root: string, name: string) => {
  const path = join(root, name);
  await writeFile(path, "#!/bin/sh\n");
  await chmod(path, 0o700);
  return path;
};

const clampedFirmwareLimits = {
  address_space_bytes: 536870912,
  file_bytes: 1048576,
  cpu_seconds: 10,
} as const;
const firmwareCommand = "/selected/binwalk";
const firmwareProducerArg = "--quiet";

const firmwareLimitProbe = (
  readLimits: NonNullable<
    Parameters<typeof runFirmwareCommand>[0]["readLimits"]
  >,
) => {
  let requested: unknown;
  let recorded: readonly string[] | undefined;
  let launched = false;
  const launcher: FirmwareLauncher = async (options) => {
    launched = true;
    recorded = options.arguments;
    throw new Error("stop after argv");
  };
  const wrapped: NonNullable<
    Parameters<typeof runFirmwareCommand>[0]["readLimits"]
  > = async (configured, scope) => {
    requested = configured;
    return readLimits(configured, scope);
  };
  return {
    launched: () => launched,
    recorded: () => recorded,
    requested: () => requested,
    run: (outputBudget?: { root: string; bytes: number; entries: number }) =>
      runFirmwareCommand({
        engine: "binwalk",
        operation: "inspect_firmware_regions",
        command: firmwareCommand,
        limiter: "/usr/bin/prlimit",
        args: [firmwareProducerArg],
        cwd: "/tmp/unused",
        environment: {},
        signal: new AbortController().signal,
        launcher,
        readLimits: wrapped,
        retainCleanup: () => undefined,
        ...(outputBudget === undefined ? {} : { outputBudget }),
      }).catch((cause: unknown) => cause),
  };
};

test("clamps firmware prlimit arguments to the injected inherited ceilings", async () => {
  const probe = firmwareLimitProbe(async () => clampedFirmwareLimits);
  await probe.run({ root: "/tmp/unused", bytes: 4096, entries: 1 });

  expect(probe.requested()).toEqual({
    address_space_bytes: FIRMWARE_LIMITS.addressSpaceBytes,
    file_bytes: 4096,
    cpu_seconds: 120,
  });
  const paired = prlimitArgumentVector(clampedFirmwareLimits, firmwareCommand);
  expect(paired.slice(0, 3)).toEqual([
    "--as=536870912:536870912",
    "--fsize=1048576:1048576",
    "--cpu=10:10",
  ]);
  expect(probe.recorded()).toEqual([...paired, firmwareProducerArg]);
});

test("asks for the report file ceiling when firmware has no output budget", async () => {
  const probe = firmwareLimitProbe(async () => clampedFirmwareLimits);
  await probe.run();

  expect(probe.requested()).toEqual({
    address_space_bytes: FIRMWARE_LIMITS.addressSpaceBytes,
    file_bytes: FIRMWARE_LIMITS.reportBytes,
    cpu_seconds: 120,
  });
  expect(FIRMWARE_LIMITS.reportBytes).toBe(8388608);
});

test("does not launch firmware when inherited Linux limits cannot be read", async () => {
  const probe = firmwareLimitProbe(async () => {
    throw new Error("limits unreadable");
  });
  const failure: unknown = await probe.run();

  expect(probe.launched()).toBe(false);
  expect(failure).toMatchObject({
    _tag: "AnalysisCapabilityUnavailableError",
    reason:
      "Inherited Linux resource limits are unavailable: limits unreadable",
  });
});
