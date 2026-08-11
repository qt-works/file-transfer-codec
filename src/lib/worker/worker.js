import { copyRgbaToBgra, Decoder } from './decoder.js'
import { initCimbar } from '@lib/wasm/cimbar_js'

var Cimbar = {}
let decoder

Cimbar.onRuntimeInitialized = () => {
  decoder = new Decoder(Cimbar, result => {
    result && !result.errorCode
      ? self.postMessage(
          result,
          result.map(item => item.buffer),
        )
      : self.postMessage(result)
  })

  //初始化完成后通知主进程
  self.postMessage(1)
}

self.addEventListener('message', e => {
  const { type, payload } = e.data
  switch (type) {
    case 'INIT':
      initCimbar(Cimbar, payload)
      break
    case 'DATA':
      const { data, width, height } = payload
      const wasmMemory = Cimbar._malloc(data.length)
      const wasmPixels = new Uint8Array(Cimbar.HEAPU8.buffer, wasmMemory, data.length)
      copyRgbaToBgra(data, wasmPixels)
      decoder.decode(wasmMemory, width, height)
      Cimbar._free(wasmMemory)
      break
  }
})

export default null;
