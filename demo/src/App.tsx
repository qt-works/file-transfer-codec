import React, { useEffect, useRef, useState } from "react";
import {
  Decoder,
  Encoder,
  initCimbar,
  isSupportedCimbarImage,
} from "../../dist/index.js";
import "./styles.less";

const SAMPLE_TEXT =
  "Hello from file-transfer-codec. This sample is encoded on screen and can be scanned back from a camera stream.";

type Mode = "encode" | "scan";
type ScanInput = "camera" | "image";
type StatusTone = "ready" | "working" | "error";
type Status = { title: string; detail: string; tone: StatusTone };
type ScanResult = { data: Uint8Array; size: number };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function makeSampleFile() {
  return new File(
    [new TextEncoder().encode(SAMPLE_TEXT)],
    "sample-message.txt",
    { type: "text/plain" }
  );
}

function describeFile(file: File) {
  return `${file.name} - ${file.size.toLocaleString()} bytes`;
}

export default function App() {
  const [mode, setMode] = useState<Mode>("encode");
  const [encodeStatus, setEncodeStatus] = useState<Status>({
    title: "Loading WebAssembly",
    detail:
      "Please wait. The encoder will start rendering the sample file once it is ready.",
    tone: "working",
  });
  const [scanStatus, setScanStatus] = useState<Status>({
    title: "Ready to scan",
    detail:
      "Allow camera access and the decoder will start looking for cimbar frames automatically.",
    tone: "ready",
  });
  const [fileInfo, setFileInfo] = useState<string>("sample-message.txt");
  const [progress, setProgress] = useState(0);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanRestart, setScanRestart] = useState(0);
  const [scanInput, setScanInput] = useState<ScanInput>("camera");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [encodedFrameUrl, setEncodedFrameUrl] = useState<string | null>(null);
  const encoderRef = useRef<Encoder | undefined>(undefined);
  const decoderRef = useRef<Decoder | undefined>(undefined);
  const pendingImageRef = useRef<File | null>(null);
  const imagePreviewUrlRef = useRef<string | null>(null);
  const pendingFileRef = useRef<File>(makeSampleFile());
  const encodeCanvasRef = useRef<HTMLCanvasElement>(null);
  const scanVideoRef = useRef<HTMLVideoElement>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const encodeFile = (file: File) => {
    setEncodedFrameUrl(null);
    pendingFileRef.current = file;
    setFileInfo(describeFile(file));
    if (!encoderRef.current) {
      setEncodeStatus({
        title: "Encoder not ready",
        detail: "WebAssembly is still initializing.",
        tone: "working",
      });
      return;
    }
    setEncodeStatus({
      title: "Encoding file",
      detail: `Rendering visual frames for ${file.name}.`,
      tone: "working",
    });
    encoderRef.current.encode(file);
  };

  useEffect(() => {
    if (mode !== "encode") return;
    const canvas = encodeCanvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const Cimbar: Record<string, any> = {};

    Cimbar.onRuntimeInitialized = () => {
      if (disposed) return;
      try {
        const encoder = new Encoder(Cimbar, canvas);
        encoderRef.current = encoder;
        encoder.onFrame = setEncodedFrameUrl;
        encoder.onFirstFrame = () => {
          if (disposed) return;
          setEncodeStatus({
            title: "Encoding ready",
            detail: `The current file ${pendingFileRef.current.name} is now looping on screen.`,
            tone: "ready",
          });
        };
        const file = pendingFileRef.current;
        setFileInfo(describeFile(file));
        setEncodeStatus({
          title: "Encoding file",
          detail: `Rendering visual frames for ${file.name}.`,
          tone: "working",
        });
        encoder.encode(file);
      } catch (error) {
        setEncodeStatus({
          title: "Failed to initialize encoder",
          detail: errorMessage(error),
          tone: "error",
        });
      }
    };

    Cimbar.onAbort = (error: unknown) => {
      if (disposed) return;
      setEncodeStatus({
        title: "WebAssembly load failed",
        detail: errorMessage(error),
        tone: "error",
      });
    };

    initCimbar(Cimbar, "/index.wasm");

    return () => {
      disposed = true;
      encoderRef.current?.destroy();
      encoderRef.current = undefined;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "scan") return;
    const video = scanVideoRef.current;
    const canvas = scanCanvasRef.current;
    if (!video || !canvas) return;

    let disposed = false;
    setProgress(0);
    setScanResult(null);
    setScanStatus({
      title: "Initializing scanner",
      detail: `Preparing the ${scanInput === "camera" ? "camera and " : ""}decoder workers.`,
      tone: "working",
    });

    const Cimbar: Record<string, any> = {};

    Cimbar.onRuntimeInitialized = () => {
      if (disposed) return;
      try {
        const decoder = new Decoder(
          Cimbar,
          video,
          canvas,
          "/index.wasm",
          "/worker.js",
          {
            onInitialized: () => {
              if (disposed) return;
              if (scanInput === "camera") {
                setScanStatus({
                  title: "Point at the screen",
                  detail:
                    "Keep the full cimbar frame inside the preview box and the decoder will start scanning automatically.",
                  tone: "ready",
                });
                decoder.startScan();
                return;
              }

              setScanStatus(
                imagePreviewUrlRef.current
                  ? {
                      title: "Decoding image",
                      detail: "The decoder is ready and is processing the selected image.",
                      tone: "working",
                    }
                  : {
                      title: "Choose a Cimbar image",
                      detail: "Select or drop a PNG, JPEG, or WebP image to decode it locally.",
                      tone: "ready",
                    }
              );
              const pendingImage = pendingImageRef.current;
              if (pendingImage) {
                pendingImageRef.current = null;
                decodeImage(decoder, pendingImage);
              }
            },
            onSuccess: (data: Uint8Array) => {
              if (disposed) return;
              setProgress(1);
              setScanResult({ data, size: data.byteLength });
              setScanStatus({
                title: "Scan complete",
                detail: "The file has been recovered and can be downloaded locally.",
                tone: "ready",
              });
            },
            onValidate: (valid: boolean) => {
              if (disposed) return;
              if (scanInput === "image") {
                setScanStatus(
                  valid
                    ? {
                        title: "Cimbar frame recognized",
                        detail:
                          "The frame is valid. If it belongs to a multi-frame transfer, more frames are required to recover the file.",
                        tone: "working",
                      }
                    : {
                        title: "No Cimbar frame detected",
                        detail: "Choose a clear, uncropped Cimbar image and try again.",
                        tone: "error",
                      }
                );
                return;
              }
              if (!valid) return;
              setScanStatus({
                title: "Recognizing frame",
                detail: "A valid frame was detected. Keep the screen steady.",
                tone: "working",
              });
            },
            onDecodeError: (code: number) => {
              if (disposed || scanInput !== "image") return;
              if (code & 4) {
                setScanStatus({
                  title: "Cimbar frame is unreadable",
                  detail:
                    "The frame was found, but its payload pixels are damaged. Upload the original 1040 x 1040 PNG instead of a resized screenshot.",
                  tone: "error",
                });
              }
            },
            onProgress: (value: number) => setProgress(value || 0),
            onLoadedVideoMetadata: ({ width, height }) => {
              if (disposed) return;
              setScanStatus((current) => ({
                ...current,
                detail: `Camera resolution is ${width} x ${height}. Waiting for a recognizable cimbar frame.`,
              }));
            },
            onError: (error: unknown) => {
              if (disposed) return;
              setScanStatus({
                title: "Camera access failed",
                detail: `${errorMessage(error)}. Check browser permissions and make sure you are on HTTPS or localhost.`,
                tone: "error",
              });
            },
          }
        );
        decoderRef.current = decoder;
      } catch (error) {
        setScanStatus({
          title: "Failed to initialize scanner",
          detail: errorMessage(error),
          tone: "error",
        });
      }
    };

    Cimbar.onAbort = (error: unknown) => {
      if (disposed) return;
      setScanStatus({
        title: "WebAssembly load failed",
        detail: errorMessage(error),
        tone: "error",
      });
    };

    initCimbar(Cimbar, "/index.wasm");

    return () => {
      disposed = true;
      decoderRef.current?.stopScan();
      decoderRef.current?.destroy();
      decoderRef.current = undefined;
    };
  }, [mode, scanRestart, scanInput]);

  useEffect(
    () => () => {
      if (imagePreviewUrlRef.current) {
        URL.revokeObjectURL(imagePreviewUrlRef.current);
      }
    },
    []
  );

  const decodeImage = (decoder: Decoder, file: File) => {
    setProgress(0);
    setScanResult(null);
    setScanStatus({
      title: "Decoding image",
      detail: `Reading ${file.name} locally.`,
      tone: "working",
    });
    decoder.decodeImage(file).catch(() => undefined);
  };

  const selectImage = (file: File) => {
    if (!isSupportedCimbarImage(file)) {
      setScanStatus({
        title: "Unsupported image",
        detail: "Choose a PNG, JPEG, or WebP image.",
        tone: "error",
      });
      return;
    }

    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    imagePreviewUrlRef.current = previewUrl;
    setImagePreviewUrl(previewUrl);

    const decoder = decoderRef.current;
    if (decoder) {
      decodeImage(decoder, file);
    } else {
      pendingImageRef.current = file;
      setScanStatus({
        title: "Preparing decoder",
        detail: `${file.name} will be decoded when the workers are ready.`,
        tone: "working",
      });
    }
  };

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    encodeFile(file);
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) selectImage(file);
  };

  const useSampleFile = () => {
    encodeFile(makeSampleFile());
  };

  const downloadResult = () => {
    if (!scanResult) return;
    const bytes = new Uint8Array(scanResult.data.byteLength);
    bytes.set(scanResult.data);
    const url = URL.createObjectURL(
      new Blob([bytes.buffer], { type: "application/octet-stream" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "decoded-file.bin";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="page">
      <header className="app-header">
        <div className="eyebrow">
          <span className="eyebrow-mark" />
          FILE TRANSFER CODEC / DEMO
        </div>
        <div className="mode-switch" role="tablist" aria-label="Demo mode">
          <button
            className={mode === "encode" ? "active" : ""}
            role="tab"
            aria-selected={mode === "encode"}
            onClick={() => setMode("encode")}
          >
            Encode
          </button>
          <button
            className={mode === "scan" ? "active" : ""}
            role="tab"
            aria-selected={mode === "scan"}
            onClick={() => setMode("scan")}
          >
            Scan
          </button>
        </div>
        <p className="intro-copy">
          {mode === "encode"
            ? "This view encodes a sample file into visual frames that another device can scan. You can also replace it with your own file and the page will re-render immediately."
            : "This view uses the camera to recognize cimbar frames on the screen and downloads the recovered file locally when decoding succeeds."}
        </p>
      </header>

      {mode === "encode" ? (
        <main className="workspace" aria-label="file encoding tool">
          <section className="tool-panel" aria-labelledby="encode-title">
            <div className="section-heading">
              <div>
                <span className="section-kicker">01 / AUTO ENCODE</span>
                <h2 id="encode-title">File Encoding</h2>
              </div>
              <span className="format-tag">UTF-8</span>
            </div>
            <div className="panel-copy">
              The default sample is <code>sample-message.txt</code>. Choose your own file and the canvas on the right will update immediately.
            </div>
            <div className="status-row" role="status">
              <span className={`status-dot ${encodeStatus.tone}`} />
              <div>
                <strong className="status-title">{encodeStatus.title}</strong>
                <span>{encodeStatus.detail}</span>
              </div>
            </div>
            <div className="action-row">
              <button onClick={handlePickFile}>Choose file</button>
              <button className="secondary" onClick={useSampleFile}>
                Regenerate sample
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden-input"
              onChange={handleFileChange}
            />
            <div className="file-summary">
              <span className="summary-label">Current file</span>
              <strong>{fileInfo}</strong>
            </div>
          </section>

          <section className="preview-panel" aria-labelledby="preview-title">
            <div className="preview-heading">
              <div>
                <span className="section-kicker">02 / OUTPUT</span>
                <h2 id="preview-title">Encoded Frame</h2>
              </div>
              <span className="live-tag">
                <span className="live-dot" />
                LIVE
              </span>
            </div>
            <div className="canvas-frame">
              <canvas
                ref={encodeCanvasRef}
                width={1040}
                height={1040}
                aria-label="encoded frame"
              />
              <div className="canvas-corner corner-top" />
              <div className="canvas-corner corner-bottom" />
            </div>
            <div className="preview-footer">
              <span>Visual frame output</span>
              {encodedFrameUrl ? (
                <a href={encodedFrameUrl} download="cimbar-frame.png">
                  Download 1040 x 1040 PNG
                </a>
              ) : (
                <span>1040 x 1040 px</span>
              )}
            </div>
          </section>
        </main>
      ) : (
        <main className="scan-panel" aria-label="file scanning tool">
          <div className="scan-heading">
            <div>
              <span className="section-kicker">02 / CAMERA SCAN</span>
              <h2>Scan and Decode</h2>
            </div>
            <div className="scan-input-switch" role="tablist" aria-label="Scan input">
              <button
                className={scanInput === "camera" ? "active" : ""}
                role="tab"
                aria-selected={scanInput === "camera"}
                onClick={() => setScanInput("camera")}
              >
                Camera
              </button>
              <button
                className={scanInput === "image" ? "active" : ""}
                role="tab"
                aria-selected={scanInput === "image"}
                onClick={() => setScanInput("image")}
              >
                Image
              </button>
            </div>
          </div>
          <div
            className={`scan-stage ${imageDragActive ? "drag-active" : ""}`}
            onDragEnter={scanInput === "image" ? (event) => {
              event.preventDefault();
              setImageDragActive(true);
            } : undefined}
            onDragOver={scanInput === "image" ? (event) => event.preventDefault() : undefined}
            onDragLeave={scanInput === "image" ? () => setImageDragActive(false) : undefined}
            onDrop={scanInput === "image" ? (event) => {
              event.preventDefault();
              setImageDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file) selectImage(file);
            } : undefined}
          >
            <video
              ref={scanVideoRef}
              className={`scan-video ${scanInput === "camera" ? "" : "scan-media-hidden"}`}
              autoPlay
              muted
              playsInline
            />
            {scanInput === "image" && (imagePreviewUrl ? (
              <img className="scan-image" src={imagePreviewUrl} alt="Selected Cimbar frame" />
            ) : (
              <button className="image-drop-target" onClick={() => imageInputRef.current?.click()}>
                <strong>Select a Cimbar image</strong>
                <span>PNG, JPEG, or WebP</span>
              </button>
            ))}
            <canvas
              ref={scanCanvasRef}
              className="scan-canvas"
              width={1040}
              height={1040}
            />
            {scanInput === "camera" && (
              <div className="scan-mask">
                <div className="scan-box">
                  <span className="scan-line" />
                </div>
              </div>
            )}
            <div className="scan-hint">{scanStatus.detail}</div>
          </div>
          <input
            ref={imageInputRef}
            className="hidden-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleImageChange}
          />
          {scanInput === "image" && imagePreviewUrl && (
            <button className="choose-image" onClick={() => imageInputRef.current?.click()}>
              Choose another image
            </button>
          )}
          <div className="scan-footer">
            <div className="scan-status">
              <span className={`status-dot ${scanStatus.tone}`} />
              <strong>{scanStatus.title}</strong>
            </div>
            <div className="progress-track">
              <div
                style={{
                  width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                }}
              />
            </div>
            <span className="progress-value">{(progress * 100).toFixed(0)}%</span>
          </div>
          {scanResult && (
            <div className="scan-result">
              <div>
                <strong>File recovered</strong>
                <span>
                  {scanResult.size.toLocaleString()} bytes - decoded-file.bin
                </span>
              </div>
              <button onClick={downloadResult}>Download file</button>
            </div>
          )}
          <button
            className="scan-restart"
            onClick={() => {
              pendingImageRef.current = null;
              setScanRestart((value) => value + 1);
            }}
          >
            {scanInput === "camera" ? "Restart scan" : "Reset decoder"}
          </button>
        </main>
      )}

      <footer className="page-footer">
        <span>
          {mode === "encode"
            ? "This demo only shows encoding output and does not access the camera."
            : scanInput === "camera"
              ? "Scanning requires camera permission. Use HTTPS or localhost."
              : "Image decoding runs locally in this browser."}
        </span>
        <span>Powered by libcimbar + WebAssembly</span>
      </footer>
    </div>
  );
}
