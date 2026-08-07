type DecodeCallback = {
  onSuccess: (data: any) => void
  onValidate: (flag: boolean) => void
  onLoadedVideoMetadata: (size: { width: number; height: number }) => void
  onProgress: (progress: number) => void
  onInitialized: () => void
  onError?: (error: unknown) => void
}

export class Decoder {
  Cimbar: any = null
  video: HTMLVideoElement
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D

  stream: MediaStream

  scanId: any = null
  interval = 66

  mediaConfig = {
    facingMode: 'environment',
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 15 },
  }

  numBytes = 32
  templatePtah = '/temp'
  outputDir = '/output/'
  outputDirHeap: Uint8Array
  templateHeap: Uint8Array

  workerCount = 4
  workers: Array<{ worker: Worker; decoding: boolean; ready: boolean }> = []
  workersReady = false

  onSuccess: (data: any) => void
  onValidate: (flag: boolean) => void
  onLoadedVideoMetadata: (size: { width: number; height: number }) => void
  onProgress: (progress: number) => void
  onInitialized: () => void
  onError?: (error: unknown) => void

  constructor(
    Cimbar: any,
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    wasmUrl: string,
    workerUrl: string,
    callback: DecodeCallback,
  ) {
    const { onSuccess, onValidate, onLoadedVideoMetadata, onProgress, onInitialized, onError } = callback
    this.Cimbar = Cimbar
    this.video = video
    this.canvas = canvas
    this.onSuccess = data => {
      this.stopScan()
      onSuccess?.(data)
    }
    this.onValidate = onValidate
    this.onLoadedVideoMetadata = onLoadedVideoMetadata
    this.onProgress = onProgress
    this.onInitialized = onInitialized
    this.onError = onError

    this.initWorkDir(this.outputDir)
    this.outputDirHeap = this.createPathHeap(this.outputDir)
    this.templateHeap = this.createPathHeap(this.templatePtah)

    this.createWorker(workerUrl, wasmUrl)

    this.Cimbar._init_sink(this.outputDirHeap.byteOffset, this.numBytes)
  }

  //创建worker
  createWorker(workerUrl, wasmUrl) {
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(workerUrl)
      worker.postMessage({ type: 'INIT', payload: wasmUrl })

      const workerRecord = { worker, decoding: false, ready: false }

      this.workers.push(workerRecord)

      worker.onmessage = e => {
        workerRecord.decoding = false

        //等待所有worker初始化完成
        if (!this.workersReady) {
          workerRecord.ready = true
          if (this.workers.every(worker => worker.ready)) {
            this.workersReady = true
            this.onInitialized?.()
          }
          return
        }

        const data = e.data
        if (!data) {
          this.onValidate?.(false)
        } else {
          this.onValidate?.(true)
          this.writeData(e.data)
        }
      }
    }
  }

  startVideoStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const error = new Error('当前浏览器不支持摄像头访问，请使用 HTTPS 或 localhost。')
      this.onError?.(error)
      return Promise.reject(error)
    }
    return (
      navigator.mediaDevices
        // .getDisplayMedia()
        .getUserMedia({
          audio: false,
          video: this.mediaConfig,
        })
        .then(stream => {
          this.stream = stream
          this.video.srcObject = stream
          this.video.addEventListener('loadedmetadata', () => {
            this.onLoadedVideoMetadata?.({ width: this.video.videoWidth, height: this.video.videoHeight })
            this.canvas.width = this.video.videoWidth
            this.canvas.height = this.video.videoHeight
          })
        })
        .catch(err => {
          console.error('Error accessing the camera: ' + err)
          this.onError?.(err)
          throw err
        })
    )
  }

  decode(imageData) {
    const idleWorker = this.workers.find(worker => !worker.decoding)
    if (!idleWorker) return
    idleWorker.decoding = true
    idleWorker.worker.postMessage({ type: 'DATA', payload: imageData })
  }

  writeData(data) {
    for (let i = 0; i < data.length; i++) {
      this.Cimbar.FS.writeFile(this.templatePtah, data[i])
      this.Cimbar._write_frame_data(this.templateHeap.byteOffset)
    }
    const progress = this.Cimbar._get_common_progress()
    this.onProgress?.(progress === 0 ? 1 : progress)
    if (progress === 0) {
      this.getDone()
    }
  }

  getDone() {
    const fileList = this.Cimbar.FS.readdir(this.outputDir)
    if (fileList.length === 3) {
      const result = this.Cimbar.FS.readFile(this.outputDir + '/' + fileList[2])
      this.onSuccess(result)
    }
  }

  captureFrame() {
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
    this.scanId = requestAnimationFrame(() => this.captureFrame())
    this.decode(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height))
  }

  startScan() {
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    this.startVideoStream()
      .then(() => {
        this.video.play()
        this.captureFrame()
      })
      .catch(() => undefined)
  }

  stopScan() {
    cancelAnimationFrame(this.scanId)
    this.video.pause()
    this.stream?.getTracks().forEach(track => track.stop())
  }

  destroy() {
    this.initWorkDir(this.outputDir, true)
    this.workers.forEach(workerRecord => {
      workerRecord.worker.terminate()
    })
  }

  initWorkDir(dir, needDel = false) {
    if (needDel) {
      const fileList = this.Cimbar.FS.readdir(dir)
      for (const filename of fileList) {
        if (filename != '.' && filename != '..') {
          this.Cimbar.FS.truncate(dir + '/' + filename, 0)
          this.Cimbar.FS.unlink(dir + '/' + filename)
        }
      }
    } else {
      this.Cimbar.FS.mkdir(dir)
    }
  }

  createPathHeap(path) {
    const numBytes = this.numBytes
    const dataPtr = this.Cimbar._malloc(numBytes)
    const dataHeap = new Uint8Array(this.Cimbar.HEAPU8.buffer, dataPtr, numBytes)
    dataHeap.fill(0)
    for (let i = 0; i < path.length; i++) {
      dataHeap[i] = path.charCodeAt(i)
    }
    return dataHeap
  }
}
