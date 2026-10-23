import { describe, expect, it } from "vitest";

import { analyzeJavaScriptStaticSource } from "./javascriptStaticAnalysis.js";

const endpoints = (source: string) =>
  analyzeJavaScriptStaticSource(source).endpoints.map(
    ({ kind, value, mechanism }) => ({ kind, value, mechanism }),
  );

describe("server-sent event endpoints", () => {
  it("reports EventSource URLs like WebSocket URLs", () => {
    expect(
      endpoints(`
        new WebSocket("wss://chat.example/ws");
        new EventSource("/api/chat/stream");
        new window.EventSource("https://chat.example/events", { withCredentials: true });
      `),
    ).toEqual([
      {
        kind: "network",
        value: "wss://chat.example/ws",
        mechanism: "call:WebSocket",
      },
      {
        kind: "network",
        value: "/api/chat/stream",
        mechanism: "call:EventSource",
      },
      {
        kind: "network",
        value: "https://chat.example/events",
        mechanism: "call:window.EventSource",
      },
    ]);
  });

  it("keeps a dynamic EventSource URL unreported", () => {
    expect(endpoints("new EventSource(url);")).toEqual([]);
  });

  it("reports member WebSocket URLs the same way as member EventSource URLs", () => {
    expect(
      endpoints(`
        new window.WebSocket("wss://chat.example/ws");
        new self.WebSocket("/socket");
        new globalThis.WebSocket("wss://events.example/live");
      `),
    ).toEqual([
      {
        kind: "network",
        value: "wss://chat.example/ws",
        mechanism: "call:window.WebSocket",
      },
      {
        kind: "network",
        value: "/socket",
        mechanism: "call:self.WebSocket",
      },
      {
        kind: "network",
        value: "wss://events.example/live",
        mechanism: "call:globalThis.WebSocket",
      },
    ]);
  });
});
