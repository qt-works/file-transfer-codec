# @qt-works/log-extraction

[English](README.md) | [简体中文](README-zh_CN.md)

`@qt-works/log-extraction` is a browser library for transferring binary log data through a camera-friendly visual code. It wraps a WebAssembly build of `libcimbar` and provides JavaScript APIs for encoding files to animated canvas frames and decoding them from a camera stream.

The package is useful when a device can show a screen but cannot easily upload logs through a network connection.

For bug reports and feature requests, please [submit an issue](https://github.com/qt-works/log-extraction/issues/new).

## Features

- Encode a `File` into cimbar frames rendered on a `<canvas>`.
- Decode cimbar frames from a camera stream.
- Run frame decoding in Web Workers.
- Ship TypeScript declaration files.
- Include the required WebAssembly runtime assets in the npm package.

## Installation

```bash
npm install @qt-works/log-extraction@latest
```

This installs the latest version published to npm.

## Quick Start: Encode

```html
<input type="file" id="input" /> <canvas id="canvas"></canvas>
```

```js
import { Encoder, initCimbar } from "@qt-works/log-extraction";

const input = document.getElementById("input");
const canvas = document.getElementById("canvas");
const Cimbar = {};

Cimbar.onRuntimeInitialized = () => {
  const encoder = new Encoder(Cimbar, canvas);

  input.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      encoder.encode(file);
    }
  });
};

initCimbar(Cimbar, "/index.wasm");
```

## Quick Start: Decode

```html
<video id="video" playsinline webkit-playsinline></video>
<canvas id="canvas" style="display: none"></canvas>
<button id="scanBtn">Scan</button>
```

```js
import { Decoder, initCimbar } from "@qt-works/log-extraction";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const scanBtn = document.getElementById("scanBtn");
const Cimbar = {};
let decoder;

Cimbar.onRuntimeInitialized = () => {
  decoder = new Decoder(Cimbar, video, canvas, "/index.wasm", "/worker.js", {
    onInitialized: () => {
      scanBtn.addEventListener("click", () => decoder.startScan());
    },
    onSuccess: (data) => {
      const blob = new Blob([data], { type: "application/octet-stream" });
      console.log("decoded log blob:", blob);
    },
    onValidate: (isAligned) => {
      console.log("frame aligned:", isAligned);
    },
    onProgress: (progress) => {
      console.log("decode progress:", progress);
    },
    onLoadedVideoMetadata: ({ width, height }) => {
      console.log("camera size:", width, height);
    },
  });
};

initCimbar(Cimbar, "/index.wasm");
```

Camera access requires a secure browser context. Use HTTPS in production or `localhost` during development.

## API Overview

### `initCimbar(Cimbar, wasmUrl)`

Loads the WebAssembly module into the provided `Cimbar` runtime object.

### `new Encoder(Cimbar, canvas)`

Creates an encoder bound to a canvas element or a canvas selector.

Common methods:

- `encode(file)` starts rendering the encoded file frames.
- `togglePause(pause)` pauses or resumes frame rendering.
- `destroy()` clears the encoder timer.

### `new Decoder(Cimbar, video, canvas, wasmUrl, workerUrl, callbacks)`

Creates a camera decoder.

Common methods:

- `startScan()` requests camera access and starts decoding frames.
- `stopScan()` stops scanning and releases camera tracks.
- `destroy()` terminates workers and clears the in-memory work directory.

Callbacks:

- `onInitialized()` fires after decoder workers are ready.
- `onSuccess(data)` receives the decoded binary data.
- `onValidate(flag)` reports whether the current frame produced valid data.
- `onProgress(progress)` reports decode progress.
- `onLoadedVideoMetadata(size)` reports the camera frame size.

## Development

```bash
npm install
npm run build
```

The build writes library output to `dist`:

- `dist/index.js`
- `dist/index.wasm`
- `dist/worker.js`
- `dist/types`

## Repository Layout

| Path             | Description                                     |
| ---------------- | ----------------------------------------------- |
| `src/lib`        | Public JavaScript and TypeScript library source |
| `src/lib/encode` | Encoder wrapper                                 |
| `src/lib/decode` | Browser camera decoder wrapper                  |
| `src/lib/worker` | Worker-side decoder                             |
| `src/lib/wasm`   | WebAssembly loader and binary                   |
| `libcimbar`      | C++ source used to build the WebAssembly binary |
| `build/lib.js`   | Library build script                            |

## License

Project code is licensed under Apache-2.0.

This repository also includes third-party components under their own licenses, including `libcimbar`, OpenCV, and several vendored C/C++ libraries. Their license files are preserved in the repository and included with the npm package. See `NOTICE` and `THIRD_PARTY_NOTICES.md` for details.
