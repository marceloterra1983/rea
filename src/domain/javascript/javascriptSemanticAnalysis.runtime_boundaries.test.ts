import { describe, expect, it } from "vitest";

import { analyzeJavaScriptSemantics } from "./javascriptSemanticAnalysis.js";

describe("JavaScript semantic analysis: runtime boundaries 1", () => {
  it("recovers EventEmitter candidates and imported timer handle cancellation", () => {
    const ir = analyzeJavaScriptSemantics(`
      import {
        setTimeout as later,
        clearTimeout as cancel,
      } from "node:timers";
      function run(bus, dynamicName) {
        const handle = later(work, 25);
        bus.on("ready", handler);
        bus.once(dynamicName, handler);
        bus.emit("ready");
        bus.off("ready", handler);
        cancel(handle);
      }
    `);

    expect(
      ir.eventOperations.map(({ kind, method, eventName, resolution }) => ({
        kind,
        method,
        eventName,
        resolution,
      })),
    ).toEqual([
      {
        kind: "register",
        method: "on",
        eventName: "ready",
        resolution: "complete",
      },
      {
        kind: "register",
        method: "once",
        eventName: null,
        resolution: "unresolved",
      },
      {
        kind: "dispatch",
        method: "emit",
        eventName: "ready",
        resolution: "complete",
      },
      {
        kind: "remove",
        method: "off",
        eventName: "ready",
        resolution: "complete",
      },
    ]);
    expect(ir.timerOperations).toEqual([
      expect.objectContaining({
        kind: "schedule",
        method: "setTimeout",
        delayMilliseconds: 25,
        resolution: "complete",
      }),
      expect.objectContaining({
        kind: "cancel",
        method: "clearTimeout",
        delayMilliseconds: null,
        resolution: "complete",
        linkedTimerId: ir.timerOperations[0]?.timerId,
      }),
    ]);
    expect(ir.functionFingerprints[0]?.components.effects).toEqual([
      "event",
      "timer",
    ]);
  });

  it("does not treat shadowed timer globals as Node timers", () => {
    const ir = analyzeJavaScriptSemantics(`
      function run(setTimeout, clearTimeout) {
        const handle = setTimeout(work, 1);
        clearTimeout(handle);
      }
    `);

    expect(ir.timerOperations).toEqual([]);
  });

  it("tracks timers called through an unmodified global object", () => {
    const ir = analyzeJavaScriptSemantics(`
      import * as timers from "node:timers";
      const handle = window.setTimeout(work, 25);
      globalThis.clearTimeout(handle);
      self.setInterval(work, 10);
      window?.setImmediate(work);
      timers.setTimeout(work, 5);
    `);

    expect(
      ir.timerOperations.map(
        ({ kind, method, delayMilliseconds, resolution, linkedTimerId }) => ({
          kind,
          method,
          delayMilliseconds,
          resolution,
          linkedTimerId,
        }),
      ),
    ).toEqual([
      {
        kind: "schedule",
        method: "setTimeout",
        delayMilliseconds: 25,
        resolution: "complete",
        linkedTimerId: null,
      },
      {
        kind: "cancel",
        method: "clearTimeout",
        delayMilliseconds: null,
        resolution: "complete",
        linkedTimerId: ir.timerOperations[0]?.timerId,
      },
      {
        kind: "schedule",
        method: "setInterval",
        delayMilliseconds: 10,
        resolution: "complete",
        linkedTimerId: null,
      },
      {
        kind: "schedule",
        method: "setImmediate",
        delayMilliseconds: null,
        resolution: "complete",
        linkedTimerId: null,
      },
      {
        kind: "schedule",
        method: "setTimeout",
        delayMilliseconds: 5,
        resolution: "complete",
        linkedTimerId: null,
      },
    ]);
  });

  it("does not treat a shadowed global object as the timer builtin", () => {
    const ir = analyzeJavaScriptSemantics(`
      function run(window) {
        const handle = window.setTimeout(work, 1);
        window.clearTimeout(handle);
        window?.setInterval(work, 1);
      }
    `);

    expect(ir.timerOperations).toEqual([]);
  });

  it("does not invent request fields or option keys from dynamic properties", () => {
    const ir = analyzeJavaScriptSemantics(`
      const key = resolveKey();
      fetch("https://example.test", { [key]: 1, body: "x" });
      spawn("/bin/tool", { [key]: vars });
    `);
    expect(
      ir.requestOperations.flatMap(({ fields }) =>
        fields.map(({ name }) => name),
      ),
    ).toEqual(["body"]);
    expect(
      ir.childProcessSpawns.some(
        ({ environmentSupplied }) => environmentSupplied,
      ),
    ).toBe(false);
  });

  it("retains every added semantic effect family", () => {
    const ir = analyzeJavaScriptSemantics(
      `
        import { spawn } from "node:child_process";
        import { open } from "node:fs/promises";
        Promise.resolve(1);
        bus.on("ready", handler);
        setTimeout(work, 1);
        spawn("/bin/tool");
        const endpoint = process.env.API_URL;
        fetch("https://example.test");
        JSON.parse(raw);
        open(path);
      `,
    );

    expect(ir.coverage.status).toBe("complete");
    expect(ir.promiseOperations).toHaveLength(1);
    expect(ir.eventOperations).toHaveLength(1);
    expect(ir.timerOperations).toHaveLength(1);
    expect(ir.childProcessSpawns).toHaveLength(1);
    expect(ir.configurationOperations).toHaveLength(1);
    expect(ir.requestOperations).toHaveLength(1);
    expect(ir.boundaryOperations).toHaveLength(1);
    expect(ir.resourceOperations).toHaveLength(1);
    expect(ir.objectOperations.length).toBeGreaterThan(0);
  });
});

describe("JavaScript semantic analysis: global object requests", () => {
  it("tracks fetch and WebSocket calls made through unmodified global objects", () => {
    const ir = analyzeJavaScriptSemantics(`
      const payload = "x";
      const extra = {};
      window.fetch("/api", { body: payload, headers: extra });
      new globalThis.WebSocket("wss://chat.example/ws", { protocols: "rea" });
      new self.WebSocket(endpoint);
    `);

    expect(
      ir.requestOperations.map(({ method, endpoint, fields }) => ({
        method,
        endpoint,
        fields: fields.map(({ name }) => name),
      })),
    ).toEqual([
      { method: "fetch", endpoint: "/api", fields: ["body", "headers"] },
      {
        method: "WebSocket",
        endpoint: "wss://chat.example/ws",
        fields: ["protocols"],
      },
      { method: "WebSocket", endpoint: null, fields: [] },
    ]);
  });

  it("does not treat a shadowed global object as the fetch builtin", () => {
    const ir = analyzeJavaScriptSemantics(`
      function run(window) {
        window.fetch("/api", { body: payload });
      }
    `);

    expect(ir.requestOperations).toEqual([]);
  });

  it("tracks EventSource and sendBeacon calls through unmodified globals", () => {
    const ir = analyzeJavaScriptSemantics(`
      new EventSource("/api/chat/stream");
      new window.EventSource("https://chat.example/events", {
        withCredentials: true,
      });
      new self.EventSource(endpoint);
      navigator.sendBeacon("/api/telemetry", { event: "click" });
      window.navigator.sendBeacon("https://metrics.example/collect");
    `);

    expect(
      ir.requestOperations.map(({ method, endpoint, fields, resolution }) => ({
        method,
        endpoint,
        fields: fields.map(({ name }) => name),
        resolution,
      })),
    ).toEqual([
      {
        method: "EventSource",
        endpoint: "/api/chat/stream",
        fields: [],
        resolution: "complete",
      },
      {
        method: "EventSource",
        endpoint: "https://chat.example/events",
        fields: ["withCredentials"],
        resolution: "complete",
      },
      {
        method: "EventSource",
        endpoint: null,
        fields: [],
        resolution: "partial",
      },
      {
        method: "sendBeacon",
        endpoint: "/api/telemetry",
        fields: [],
        resolution: "complete",
      },
      {
        method: "sendBeacon",
        endpoint: "https://metrics.example/collect",
        fields: [],
        resolution: "complete",
      },
    ]);
  });

  it("does not treat shadowed EventSource or navigator as network builtins", () => {
    const ir = analyzeJavaScriptSemantics(`
      function run(EventSource, navigator, window) {
        new EventSource("/api/chat/stream");
        new window.EventSource("/events", { withCredentials: true });
        navigator.sendBeacon("/api/telemetry", { event: "click" });
        window.navigator.sendBeacon("/collect");
      }
    `);

    expect(ir.requestOperations).toEqual([]);
  });

  it("tracks network calls read through an optional global object", () => {
    const ir = analyzeJavaScriptSemantics(`
      const payload = "x";
      const extra = {};
      window?.fetch("/api", { body: payload, headers: extra });
      window.fetch?.("/direct", { method: "POST" });
      new (globalThis?.WebSocket)("wss://chat.example/ws", { protocols: "rea" });
      new (self?.EventSource)("/events", { withCredentials: true });
      window?.navigator.sendBeacon("/collect", { event: "click" });
    `);

    expect(
      ir.requestOperations.map(({ method, endpoint, fields, resolution }) => ({
        method,
        endpoint,
        fields: fields.map(({ name }) => name),
        resolution,
      })),
    ).toEqual([
      {
        method: "fetch",
        endpoint: "/api",
        fields: ["body", "headers"],
        resolution: "complete",
      },
      {
        method: "fetch",
        endpoint: "/direct",
        fields: ["method"],
        resolution: "complete",
      },
      {
        method: "WebSocket",
        endpoint: "wss://chat.example/ws",
        fields: ["protocols"],
        resolution: "complete",
      },
      {
        method: "EventSource",
        endpoint: "/events",
        fields: ["withCredentials"],
        resolution: "complete",
      },
      {
        method: "sendBeacon",
        endpoint: "/collect",
        fields: [],
        resolution: "complete",
      },
    ]);
  });

  it("does not treat an optional chain on a shadowed global as a builtin", () => {
    const ir = analyzeJavaScriptSemantics(`
      function run(window, channel) {
        window?.fetch("/api", { body: payload });
        channel?.fetch("/api");
        new (window?.WebSocket)("wss://chat.example/ws");
        new (window?.EventSource)("/events");
        window?.navigator.sendBeacon("/collect", { event: "click" });
      }
    `);

    expect(ir.requestOperations).toEqual([]);
  });
});

describe("JavaScript semantic analysis: event dispatch data", () => {
  it("keeps emitted data out of dispatch listener fields", () => {
    const ir = analyzeJavaScriptSemantics(`
      import { EventEmitter } from "node:events";
      const bus = new EventEmitter();
      const data = 1;
      const handler = () => {};
      bus.on("ready", handler);
      bus.emit("ready", data);
      bus.emit("ready");
      bus.off("ready", handler);
      bus.removeAllListeners("ready", data);
    `);
    const handler = ir.bindings.find(({ name }) => name === "handler");
    expect(handler).toBeDefined();
    expect(
      ir.eventOperations.map(
        ({ kind, method, listenerBindingId, listenerLocation }) => ({
          kind,
          method,
          listenerBindingId,
          hasListenerLocation: listenerLocation !== null,
        }),
      ),
    ).toEqual([
      {
        kind: "register",
        method: "on",
        listenerBindingId: handler?.bindingId,
        hasListenerLocation: true,
      },
      {
        kind: "dispatch",
        method: "emit",
        listenerBindingId: null,
        hasListenerLocation: false,
      },
      {
        kind: "dispatch",
        method: "emit",
        listenerBindingId: null,
        hasListenerLocation: false,
      },
      {
        kind: "remove",
        method: "off",
        listenerBindingId: handler?.bindingId,
        hasListenerLocation: true,
      },
      {
        kind: "remove",
        method: "removeAllListeners",
        listenerBindingId: null,
        hasListenerLocation: false,
      },
    ]);
    expect(
      ir.eventOperations.map(({ eventName, resolution }) => [
        eventName,
        resolution,
      ]),
    ).toEqual([
      ["ready", "complete"],
      ["ready", "complete"],
      ["ready", "complete"],
      ["ready", "complete"],
      ["ready", "complete"],
    ]);
  });
});
