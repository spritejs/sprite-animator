
export function defer() {
  const ret = {}
  ret.promise = new Promise((resolve, reject) => {
    ret.resolve = resolve
    ret.reject = reject
  })
  return ret
}

export function periodicity(val, dur) {
  const t = Math.floor(val / dur)
  if(t) {
    val -= t * dur
    return val || dur // 周期值，0 的时候是 0，dur 的时候是 1，所以要分 t 是否为 0
  }
  return val
}

export function calculateFramesOffset(keyframes) {
  keyframes = keyframes.slice(0)

  const firstFrame = keyframes[0],
    lastFrame = keyframes[keyframes.length - 1]

  lastFrame.offset = lastFrame.offset || 1
  firstFrame.offset = firstFrame.offset || 0

  let offset = 0,
    offsetFrom = -1

  for(let i = 0; i < keyframes.length; i++) {
    const frame = keyframes[i]
    if(frame.offset != null) {
      const dis = i - offsetFrom
      if(dis > 1) {
        const delta = (frame.offset - offset) / (dis)
        for(let j = 0; j < dis - 1; j++) {
          keyframes[offsetFrom + j + 1].offset = offset + delta * (j + 1)
        }
      }
      offset = frame.offset
      offsetFrom = i
    }
    if(i > 0) {
      // 如果中间某个属性没有了，需要从前一帧复制过来
      keyframes[i] = Object.assign({}, keyframes[i - 1], keyframes[i])
    }
  }

  return keyframes
}
