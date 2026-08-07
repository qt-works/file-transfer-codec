# file-transfer-codec

[English](README.md) | [简体中文](README-zh_CN.md)

`@qt-works/file-transfer-codec` 是一个用于离线屏幕到摄像头文件传输的浏览器和 TypeScript 库。它封装了基于 WebAssembly 构建的 `libcimbar`，提供把文件编码为动态视觉帧，以及从摄像头画面解码还原文件的 JavaScript API。

## 解决的问题

当两个设备都能显示和扫描屏幕，但又不方便或不允许通过网络传文件时，可以使用这个库。

它适合这些场景：

- 把日志从隔离工作站导出；
- 把小型二进制文件传到手机上查看；
- 在受限网络或物理隔离环境中进行定向传递；
- 用浏览器完成文件交接，而不用安装原生传输软件。

## 应用场景

- 支持人员在工作站上打开日志文件，在浏览器里编码后，用手机扫描把文件发给其他设备。
- 开发人员需要把内部环境中的小构件导出，但不想打开文件共享服务。
- 用户想要一种可以在普通网页中完成、并且可逆的摄像头传输路径。

## 功能

- 将 `File` 编码为在 `<canvas>` 上渲染的 cimbar 帧。
- 从摄像头视频流中解码 cimbar 帧。
- 使用 Web Worker 执行帧解码。
- 提供 TypeScript 类型声明。
- 在 npm 包中包含所需的 WebAssembly 运行时资源。

## 安装

```bash
npm install @qt-works/file-transfer-codec@latest
```

## Demo

仓库内置了一个浏览器 Demo，包含“编码”和“扫码”两个模式。

```bash
npm run dev:demo
```

Demo 会在 `http://localhost:5173/` 启动。编码页默认渲染一个示例文件，扫码页会调用摄像头识别帧并下载还原后的文件。

需要构建生产版本时执行 `npm run build-demo`，输出目录为 `demo/dist`。

## 使用限制

- 更适合小到中等大小的文件。接近 30 MB 或更大的文件，在手机上扫码会明显变慢，也更容易失败。
- 扫码需要稳定的屏幕画面、足够的对比度，以及 HTTPS 或 `localhost` 这样的安全浏览器环境。
- 这是一个文件传递方案，不是通用同步工具。它比正常网络传输慢，适合定向交接、隔离环境和临时导出场景。

## 快速开始：编码

```html
<input type="file" id="input" />
<canvas id="canvas"></canvas>
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
      console.log("decoded file blob:", blob);
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
    onError: (error) => {
      console.error("camera error:", error);
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
- `onError(error)`：报告摄像头访问失败。

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
