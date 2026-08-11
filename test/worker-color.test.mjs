import assert from "node:assert/strict";
import test from "node:test";

import { copyRgbaToBgra } from "../src/lib/worker/decoder.js";

test("copyRgbaToBgra swaps red and blue before WASM decoding", () => {
  const rgba = new Uint8ClampedArray([
    10, 20, 30, 255,
    1, 2, 3, 4,
  ]);
  const wasmBytes = new Uint8Array(rgba.length);

  copyRgbaToBgra(rgba, wasmBytes);

  assert.deepEqual([...wasmBytes], [
    30, 20, 10, 255,
    3, 2, 1, 4,
  ]);
});
