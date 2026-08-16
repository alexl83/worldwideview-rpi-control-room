import assert from "node:assert/strict";
import test from "node:test";
import { signalProcessTree } from "../src/codex-process.mjs";

test("signals the detached POSIX process group", () => {
  const calls = [];
  const child = { pid: 1234, kill: () => assert.fail("direct child fallback used") };
  assert.equal(signalProcessTree(child, "SIGINT", {
    platform: "linux",
    kill: (pid, signal) => calls.push({ pid, signal }),
  }), true);
  assert.deepEqual(calls, [{ pid: -1234, signal: "SIGINT" }]);
});

test("falls back to the direct child when process-group signaling is unavailable", () => {
  const calls = [];
  const child = { pid: 1234, kill: (signal) => { calls.push(signal); return true; } };
  assert.equal(signalProcessTree(child, "SIGKILL", {
    platform: "linux",
    kill: () => { const error = new Error("not permitted"); error.code = "EPERM"; throw error; },
  }), true);
  assert.deepEqual(calls, ["SIGKILL"]);
});

test("treats an already exited process group as complete", () => {
  const error = new Error("missing");
  error.code = "ESRCH";
  assert.equal(signalProcessTree({ pid: 1234 }, "SIGINT", {
    platform: "linux",
    kill: () => { throw error; },
  }), false);
});
