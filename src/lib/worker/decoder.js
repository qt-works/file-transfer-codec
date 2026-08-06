export class Decoder {
  constructor(Cimbar, onComplete) {
    this.Cimbar = Cimbar
    this.numBytes = 32
    this.templateDir = '/template_data/'
    this.outputDir = '/out/'
    this.outputHeap = null
    this.onComplete = onComplete

    this.initWorkDir(this.templateDir)
    this.initWorkDir(this.outputDir)
    this.outputHeap = this.createPathHeap(this.outputDir)
  }

  initWorkDir(dir, needDel) {
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

  decode(frame, width, height) {
    const res = this.Cimbar._decodeImage(frame, width, height, this.outputHeap.byteOffset, this.numBytes)

    if (res !== 0) {
      if (this.onComplete) this.onComplete(false)
      return
    }

    const fileList = this.Cimbar.FS.readdir(this.templateDir)
    if (fileList.length < 2) return
    const data = []

    for (const filename of fileList) {
      if (filename != '.' && filename != '..') {
        if (filename != '.' && filename != '..') {
          const tempData = this.Cimbar.FS.readFile(this.templateDir + filename)
          data.push(tempData)
        }
      }
    }

    if (this.onComplete) this.onComplete(data)

    this.initWorkDir(this.templateDir, true)
  }

  destroy() {
    this.initWorkDir(this.outputDir, true)
    this.initWorkDir(this.templateDir, true)
  }
}
