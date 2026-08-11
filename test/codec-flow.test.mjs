import assert from "node:assert/strict";
import test from "node:test";

import { Decoder, Encoder } from "../dist/index.js";
import { Decoder as WorkerDecoder } from "../src/lib/worker/decoder.js";

test("Encoder writes input bytes to WASM before encoding and frees the buffer", () => {
  const heap = new Uint8Array(64);
  const calls = [];
  const encoder = Object.create(Encoder.prototype);
  encoder.Cimbar = {
    HEAPU8: heap,
    _malloc(size) {
      calls.push(["malloc", size]);
      return 8;
    },
    _encode(pointer, size, encodeId) {
      calls.push(["encode", pointer, size, encodeId, [...heap.slice(pointer, pointer + size)]]);
    },
    _free(pointer) {
      calls.push(["free", pointer]);
    },
  };

  encoder._encode(new Uint8Array([10, 20, 30, 40]));

  assert.deepEqual(calls, [
    ["malloc", 4],
    ["encode", 8, 4, -1, [10, 20, 30, 40]],
    ["free", 8],
  ]);
});

test("Encoder reads a file, resets frame state, and starts rendering", async () => {
  const originalFileReader = globalThis.FileReader;
  const file = { name: "payload.bin" };
  const calls = [];

  class LoadedFileReader {
    readAsArrayBuffer(value) {
      calls.push(["read", value]);
      queueMicrotask(() => {
        this.onload({ target: { result: Uint8Array.from([1, 2, 3]).buffer } });
      });
    }
  }

  globalThis.FileReader = LoadedFileReader;

  try {
    const encoder = Object.create(Encoder.prototype);
    encoder.hasRenderedFrame = true;
    encoder.togglePause = (paused) => calls.push(["pause", paused]);
    encoder._encode = (data) => calls.push(["encode", [...data]]);

    encoder.encode(file);
    assert.equal(encoder.hasRenderedFrame, false);
    assert.deepEqual(calls, [["pause", true], ["read", file]]);

    await Promise.resolve();
    assert.deepEqual(calls, [
      ["pause", true],
      ["read", file],
      ["encode", [1, 2, 3]],
      ["pause", false],
    ]);
  } finally {
    globalThis.FileReader = originalFileReader;
  }
});

test("Decoder sends a frame only to an idle worker", () => {
  const messages = [];
  const busyWorker = { decoding: true, worker: { postMessage: () => messages.push("busy") } };
  const idleWorker = {
    decoding: false,
    worker: { postMessage: (message) => messages.push(message) },
  };
  const frame = { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) };
  const decoder = Object.create(Decoder.prototype);
  decoder.workers = [busyWorker, idleWorker];

  decoder.decode(frame);

  assert.equal(idleWorker.decoding, true);
  assert.deepEqual(messages, [{ type: "DATA", payload: frame }]);

  decoder.decode(frame);
  assert.equal(messages.length, 1);
});

test("Decoder captures a camera frame and submits its pixels", () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const calls = [];
  const frame = { width: 1280, height: 720, data: new Uint8ClampedArray(4) };

  globalThis.requestAnimationFrame = (callback) => {
    calls.push(["schedule", callback]);
    return 42;
  };

  try {
    const decoder = Object.create(Decoder.prototype);
    decoder.video = { id: "camera" };
    decoder.canvas = { width: 1280, height: 720 };
    decoder.ctx = {
      drawImage: (...args) => calls.push(["draw", ...args]),
      getImageData: (...args) => {
        calls.push(["pixels", ...args]);
        return frame;
      },
    };
    decoder.decode = (imageData) => calls.push(["decode", imageData]);

    decoder.captureFrame();

    assert.equal(decoder.scanId, 42);
    assert.deepEqual(calls.filter(([name]) => name !== "schedule"), [
      ["draw", decoder.video, 0, 0, 1280, 720],
      ["pixels", 0, 0, 1280, 720],
      ["decode", frame],
    ]);
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("Decoder writes decoded chunks and reports completion progress", () => {
  const calls = [];
  const decoder = Object.create(Decoder.prototype);
  decoder.templatePtah = "/temp";
  decoder.templateHeap = { byteOffset: 24 };
  decoder.Cimbar = {
    FS: {
      writeFile(path, data) {
        calls.push(["write", path, [...data]]);
      },
    },
    _write_frame_data(pointer) {
      calls.push(["consume", pointer]);
    },
    _get_common_progress() {
      return 0;
    },
  };
  decoder.onProgress = (progress) => calls.push(["progress", progress]);
  decoder.getDone = () => calls.push(["done"]);

  decoder.writeData([Uint8Array.from([1, 2]), Uint8Array.from([3])]);

  assert.deepEqual(calls, [
    ["write", "/temp", [1, 2]],
    ["consume", 24],
    ["write", "/temp", [3]],
    ["consume", 24],
    ["progress", 1],
    ["done"],
  ]);
});

test("Worker decoder returns the native Cimbar error code", () => {
  const heap = new Uint8Array(128);
  const results = [];
  const calls = [];
  const Cimbar = {
    HEAPU8: heap,
    FS: {
      mkdir(path) {
        calls.push(["mkdir", path]);
      },
    },
    _malloc() {
      return 16;
    },
    _decodeImage(frame, width, height, outputPointer, outputSize) {
      calls.push(["decode", frame, width, height, outputPointer, outputSize]);
      return 4;
    },
  };
  const decoder = new WorkerDecoder(Cimbar, (result) => results.push(result));

  decoder.decode(48, 1040, 1040);

  assert.deepEqual(calls, [
    ["mkdir", "/template_data/"],
    ["mkdir", "/out/"],
    ["decode", 48, 1040, 1040, 16, 32],
  ]);
  assert.deepEqual(results, [{ errorCode: 4 }]);
});
