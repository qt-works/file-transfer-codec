export class Encoder {
  Cimbar: any = null
  canvas: HTMLCanvasElement
  interval = 66
  isPaused = true
  timeId: any
  onFirstFrame?: () => void
  onFrame?: (dataUrl: string) => void
  hasRenderedFrame = false

  constructor(Cimbar: any, canvas: HTMLCanvasElement | string) {
    this.canvas = typeof canvas === 'string' ? document.querySelector(canvas) : canvas
    if (!(this.canvas instanceof HTMLCanvasElement)) {
      throw new Error('canvas not find')
    }
    Cimbar.canvas = this.canvas
    Cimbar._initialize_GL(1040, 1040)
    this.Cimbar = Cimbar
  }

  _encode(data) {
    const numBytes = data.length * data.BYTES_PER_ELEMENT
    const dataPtr = this.Cimbar._malloc(numBytes)
    const dataOnHeap = new Uint8Array(this.Cimbar.HEAPU8.buffer, dataPtr, numBytes)
    dataOnHeap.set(data)
    this.Cimbar._encode(dataOnHeap.byteOffset, dataOnHeap.length, -1)
    this.Cimbar._free(dataPtr)
  }

  _nextFrame() {
    if (this.isPaused) return
    let start = performance.now()
    const rendered = this.Cimbar._render()
    this.Cimbar._next_frame()
    if (rendered > 0 && !this.hasRenderedFrame) {
      this.hasRenderedFrame = true
      this.onFrame?.(captureFrameDataUrl(this.canvas))
      this.onFirstFrame?.()
    }
    let elapsed = performance.now() - start
    let nextInterval = this.interval > elapsed ? this.interval - elapsed : 0
    this.timeId = setTimeout(() => {
      this._nextFrame()
    }, nextInterval)
  }

  encode(file) {
    this.togglePause(true)
    this.hasRenderedFrame = false
    const fileReader = new FileReader()
    fileReader.onload = event => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer)

      this._encode(data)

      this.togglePause(false)
    }
    fileReader.onerror = () => {
      console.error('Unable to read file')
    }
    fileReader.readAsArrayBuffer(file)
  }

  togglePause(pause) {
    this.timeId && clearTimeout(this.timeId)
    if (pause === undefined) {
      this.isPaused = !this.isPaused
    } else {
      this.isPaused = pause
    }
    this._nextFrame()
  }

  destroy() {
    clearTimeout(this.timeId)
  }
}

export function captureFrameDataUrl(canvas: Pick<HTMLCanvasElement, 'toDataURL'>) {
  return canvas.toDataURL('image/png')
}
