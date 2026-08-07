# 文件编码解码工具

[English](README.md) | 简体中文

`@qt-works/file-transfer-codec` 是一个用于文件编码和解码的浏览器库。它封装了基于 WebAssembly 构建的 `libcimbar`，提供将文件编码为连续画面，以及从摄像头画面解码还原文件的 JavaScript API。借助屏幕展示和网页扫码，可以在不同设备之间传递文件，而不依赖设备之间的网络连接。

当设备可以显示屏幕、但不方便通过网络传输文件时，可以使用这个包传输文件或日志。

## 功能概览

本工具可以将文件编码为连续二维码画面（cimbar 帧），接收方使用网页扫码工具扫描这些画面即可解码还原文件，从而实现跨设备文件传递。

### 解决的问题

在隔离网络、内网或其他受限环境中，通过手机（网页扫码方式）可以扫描电脑屏幕上的错误日志或文件，再将扫描结果交给开发人员进行问题排查。

### 限制

- 单个文件大小上限为 30 MB 左右（文件太大，手机扫码可能导致手机发烫，扫码失败）。

## 核心能力

- 将 `File` 编码为在画布上渲染的 cimbar 帧。
- 从摄像头视频流中解码 cimbar 帧。
- 使用 Web Worker 执行帧解码。
- 提供 TypeScript 类型声明。
- 在 npm 包中包含所需的 WebAssembly 运行时资源。

## 安装

```bash
npm install @qt-works/file-transfer-codec@latest
```

该命令会安装发布到 npm 的最新版本。

## 简单 Demo

仓库内置了一个仅编码的浏览器 Demo，打开后会自动将 `helloworld` 编码为连续画面，不提供输入框，不调用摄像头，也不执行文件解码。

```bash
npm run build
python -m http.server 8080
```

然后打开 `http://localhost:8080/demo/`，即可直接看到编码画面。

## 快速开始：编码

```html
<input type="file" id="input" /> <canvas id="canvas"></canvas>
```

```js
import { Encoder, initCimbar } from "@qt-works/file-transfer-codec";

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

## 快速开始：解码

```html
<video id="video" playsinline webkit-playsinline></video>
<canvas id="canvas" style="display: none"></canvas>
<button id="scanBtn">Scan</button>
```

```js
import { Decoder, initCimbar } from "@qt-works/file-transfer-codec";

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

摄像头访问需要安全浏览器环境。生产环境请使用 HTTPS，开发环境可以使用 `localhost`。

## API 概览

### `initCimbar(Cimbar, wasmUrl)`

将 WebAssembly 模块加载到传入的 `Cimbar` 运行时对象中。

### `new Encoder(Cimbar, canvas)`

创建绑定到画布元素或画布选择器的编码器。

常用方法：

- `encode(file)`：开始渲染文件编码帧。
- `togglePause(pause)`：暂停或恢复帧渲染。
- `destroy()`：清理编码器定时器。

### `new Decoder(Cimbar, video, canvas, wasmUrl, workerUrl, callbacks)`

创建摄像头解码器。

常用方法：

- `startScan()`：请求摄像头权限并开始解码。
- `stopScan()`：停止扫描并释放摄像头轨道。
- `destroy()`：终止 Worker 并清理内存中的工作目录。

回调函数：

- `onInitialized()`：解码器 Worker 准备完成后触发。
- `onSuccess(data)`：成功解码后接收二进制数据。
- `onValidate(flag)`：报告当前帧是否产生有效数据。
- `onProgress(progress)`：报告解码进度。
- `onLoadedVideoMetadata(size)`：报告摄像头视频尺寸。

## 开发

```bash
npm install
npm run build
```

构建结果会写入 `dist`：

- `dist/index.js`
- `dist/index.wasm`
- `dist/worker.js`
- `dist/types`

## 仓库结构

| 路径             | 说明                                       |
| ---------------- | ------------------------------------------ |
| `src/lib`        | 对外公开的 JavaScript 和 TypeScript 库源码 |
| `src/lib/encode` | 编码器封装                                 |
| `src/lib/decode` | 浏览器摄像头解码器封装                     |
| `src/lib/worker` | Worker 侧解码逻辑                          |
| `src/lib/wasm`   | WebAssembly 加载器和二进制文件             |
| `libcimbar`      | 用于构建 WebAssembly 二进制文件的 C++ 源码 |
| `build/lib.js`   | 库构建脚本                                 |

## 贡献者

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/promise96319">
        <img src="https://github.com/promise96319.png" width="100px" height="100px" alt="promise96319" />
        <br />
        <sub><b>promise96319</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/lucassss-li">
        <img src="https://github.com/lucassss-li.png" width="100px" height="100px" alt="lucassss-li" />
        <br />
        <sub><b>lucassss-li</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/SherCong">
        <img src="https://github.com/SherCong.png" width="100px" height="100px" alt="SherCong" />
        <br />
        <sub><b>SherCong</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/qiuliaolin">
        <img src="https://github.com/qiuliaolin.png" width="100px" height="100px" alt="qiuliaolin" />
        <br />
        <sub><b>qiuliaolin</b></sub>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/hbche">
        <img src="https://github.com/hbche.png" width="100px" height="100px" alt="hbche" />
        <br />
        <sub><b>hbche</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/Libra-Lei">
        <img src="https://github.com/Libra-Lei.png" width="100px" height="100px" alt="Libra-Lei" />
        <br />
        <sub><b>Libra-Lei</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/MuZiRuoYi">
        <img src="https://github.com/MuZiRuoYi.png" width="100px" height="100px" alt="MuZiRuoYi" />
        <br />
        <sub><b>MuZiRuoYi</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/qt-xin">
        <img src="https://github.com/qt-xin.png" width="100px" height="100px" alt="qt-xin" />
        <br />
        <sub><b>qt-xin</b></sub>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/Bxiaoyao">
        <img src="https://github.com/Bxiaoyao.png" width="100px" height="100px" alt="Bxiaoyao" />
        <br />
        <sub><b>Bxiaoyao</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/mondayZhyi">
        <img src="https://github.com/mondayZhyi.png" width="100px" height="100px" alt="mondayZhyi" />
        <br />
        <sub><b>mondayZhyi</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/yangyusiya">
        <img src="https://github.com/yangyusiya.png" width="100px" height="100px" alt="yangyusiya" />
        <br />
        <sub><b>yangyusiya</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/SilenceChen">
        <img src="https://github.com/SilenceChen.png" width="100px" height="100px" alt="SilenceChen" />
        <br />
        <sub><b>SilenceChen</b></sub>
      </a>
    </td>
  </tr>
</table>

## 许可证

项目代码使用 Apache-2.0 许可证。

本仓库还包含使用其他许可证的第三方组件，包括 `libcimbar`、OpenCV 以及多个 vendored C/C++ 库。仓库和 npm 包中保留了相应许可证文件，详情请参阅 `NOTICE` 和 `THIRD_PARTY_NOTICES.md`。
