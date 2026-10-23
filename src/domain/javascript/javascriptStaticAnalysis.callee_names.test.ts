import { describe, expect, it } from "vitest";

import { analyzeJavaScriptStaticSource } from "./javascriptStaticAnalysis.js";

const summarize = (source: string) => {
  const analysis = analyzeJavaScriptStaticSource(source);
  return {
    endpoints: analysis.endpoints.map(({ kind, value, mechanism }) => ({
      kind,
      value,
      mechanism,
    })),
    roles: analysis.role_paths.map(({ role, path, mechanism }) => ({
      role,
      path,
      mechanism,
    })),
    references: analysis.references.map(({ kind, specifier }) => ({
      kind,
      specifier,
    })),
    storage: analysis.storage.map(({ kind, name, mechanism }) => ({
      kind,
      name,
      mechanism,
    })),
  };
};

describe("JavaScript callee name boundaries", () => {
  it("keeps downloadURL as a network endpoint and not a renderer load", () => {
    expect(
      summarize(`
        win.loadURL("https://app.example/");
        win.loadFile("./index.html");
        contents.downloadURL("https://cdn.example/file.bin");
        session.downloadURL("/downloads/file.bin");
        custompreloadURL("https://not-a-load.example/");
        customdownloadFile("./not-a-file");
      `),
    ).toEqual({
      endpoints: [
        {
          kind: "network",
          value: "https://app.example/",
          mechanism: "call:win.loadURL",
        },
        {
          kind: "network",
          value: "https://cdn.example/file.bin",
          mechanism: "call:contents.downloadURL",
        },
        {
          kind: "network",
          value: "/downloads/file.bin",
          mechanism: "call:session.downloadURL",
        },
      ],
      roles: [
        {
          role: "renderer",
          path: "https://app.example/",
          mechanism: "call:win.loadURL",
        },
        {
          role: "renderer",
          path: "./index.html",
          mechanism: "call:win.loadFile",
        },
      ],
      references: [],
      storage: [],
    });
  });

  it("does not treat longer names as service worker or storage APIs", () => {
    expect(
      summarize(`
        navigator.serviceWorker.register("./sw.js");
        serviceWorker.register("./root-sw.js");
        myserviceWorker.register("./not-a-worker.js");
        localStorage.setItem("token", value);
        window.sessionStorage.getItem("token");
        mylocalStorage.setItem("token", value);
        indexedDB.open("app");
        window.caches.open("app");
        notindexedDB.open("app");
        mycaches.open("app");
      `),
    ).toEqual({
      endpoints: [],
      roles: [],
      references: [
        { kind: "service-worker", specifier: "./sw.js" },
        { kind: "service-worker", specifier: "./root-sw.js" },
      ],
      storage: [
        {
          kind: "local-storage",
          name: "token",
          mechanism: "call:localStorage.setItem",
        },
        {
          kind: "session-storage",
          name: "token",
          mechanism: "call:window.sessionStorage.getItem",
        },
        {
          kind: "indexed-db",
          name: "app",
          mechanism: "call:indexedDB.open",
        },
        {
          kind: "cache-storage",
          name: "app",
          mechanism: "call:window.caches.open",
        },
      ],
    });
  });
});
