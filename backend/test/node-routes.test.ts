import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/server.js";
import { defaultNodeRegistry } from "../src/nodes/index.js";
import type { Server } from "node:http";

describe("Phase 4.1: Node Routes Integration Tests", () => {
  it("GET /api/nodes returns 200 with list of registered manifests", async () => {
    // Register a test node into defaultNodeRegistry
    defaultNodeRegistry.clear();
    defaultNodeRegistry.register({
      manifest: {
        type: "api_probe_node",
        name: "API Probe",
        version: "1.0.0",
        description: "Node for testing endpoint",
        category: "utility",
        inputs: [],
        outputs: [],
        configFields: [],
      },
      handler: {
        async execute() {
          return { success: true };
        },
      },
    });

    const app = createServer();
    const server: Server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 5001;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/nodes`);
      assert.strictEqual(res.status, 200);

      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(json.data.length >= 5);
      const probeNode = json.data.find((m: { type: string }) => m.type === "api_probe_node");
      assert.ok(probeNode);
      assert.strictEqual(probeNode.name, "API Probe");
      // Security check: handler is not exposed
      assert.strictEqual((probeNode as Record<string, unknown>).handler, undefined);
    } finally {
      server.close();
      defaultNodeRegistry.clear();
    }
  });

  it("POST /api/nodes/validate-config validates valid config payload", async () => {
    const app = createServer();
    const server: Server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 5001;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/nodes/validate-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "text_transform",
          config: { operation: "uppercase" },
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.isValid, true);
      assert.deepStrictEqual(json.data.errors, []);
    } finally {
      server.close();
      defaultNodeRegistry.clear();
    }
  });

  it("POST /api/nodes/validate-config detects invalid config payload", async () => {
    const app = createServer();
    const server: Server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 5001;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/nodes/validate-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "text_transform",
          config: { operation: "invalid_operation" },
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.isValid, false);
      assert.ok(json.data.errors.length > 0);
      assert.strictEqual(json.data.errors[0].field, "operation");
    } finally {
      server.close();
      defaultNodeRegistry.clear();
    }
  });

  it("POST /api/nodes/validate-config returns 400 when type is missing", async () => {
    const app = createServer();
    const server: Server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 5001;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/nodes/validate-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {},
        }),
      });

      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error.code, "VALIDATION_ERROR");
    } finally {
      server.close();
      defaultNodeRegistry.clear();
    }
  });

  it("POST /api/nodes/validate-config returns 404 for unregistered node type", async () => {
    const app = createServer();
    const server: Server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 5001;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/nodes/validate-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "non_existent_node",
          config: {},
        }),
      });

      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error.code, "HANDLER_NOT_FOUND");
    } finally {
      server.close();
      defaultNodeRegistry.clear();
    }
  });
});
