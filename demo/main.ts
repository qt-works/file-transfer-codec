import { Encoder, initCimbar } from "../dist/index.js";

const DEFAULT_CONTENT = "hello world";

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing demo element: ${selector}`);
  return element;
}

const encodeCanvas = getElement<HTMLCanvasElement>("#encode-canvas");
const statusText = getElement<HTMLElement>("#status-text");
const statusDetail = getElement<HTMLElement>("#status-detail");
const statusDot = getElement<HTMLElement>("#status-dot");
const Cimbar: Record<string, unknown> = {};
let encoder: Encoder | undefined;

function setStatus(
  text: string,
  detail: string,
  tone: "ready" | "working" | "error" = "ready"
) {
  statusText.textContent = text;
  statusDetail.textContent = detail;
  statusDot.dataset.tone = tone;
}

function encodeDefaultContent() {
  if (!encoder) return;
  const file = new File(
    [new TextEncoder().encode(DEFAULT_CONTENT)],
    "helloworld.txt",
    { type: "text/plain" }
  );
  encoder.onFirstFrame = () => {
    setStatus("编码已就绪", "二维码画面已生成，可直接展示给另一台设备。");
  };
  encoder.encode(file);
  setStatus("正在编码", "正在生成首个二维码画面，请稍候。", "working");
}

Cimbar.onRuntimeInitialized = () => {
  try {
    encoder = new Encoder(Cimbar, encodeCanvas);
    setStatus("编码器已就绪", "页面加载完成后会自动生成固定内容的编码画面。");
    encodeDefaultContent();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus("编码器初始化失败", message, "error");
  }
};

Cimbar.onAbort = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  setStatus("WebAssembly 加载失败", message, "error");
};

setStatus("正在加载 WebAssembly 模块...", "请稍候。");
initCimbar(Cimbar, "../dist/index.wasm");
