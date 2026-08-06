import { Decoder } from './decoder.js'
import { initCimbar } from '@lib/wasm/cimbar_js'

var Cimbar = {}
let decoder

Cimbar.onRuntimeInitialized = () => {
  decoder = new Decoder(Cimbar, result => {
    result
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
      Cimbar.HEAPU8.set(data, wasmMemory)
      decoder.decode(wasmMemory, width, height)
      Cimbar._free(wasmMemory)
      break
  }
})

export default null;