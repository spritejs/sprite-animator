
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

const BezierEasing = require('bezier-easing')
const bezierFuncCache = new Map()

export function getBezierEasing(...value) {
  let easing = bezierFuncCache.get(value)
  if(easing) {
    return easing
  }
  easing = BezierEasing(...value)
  bezierFuncCache.set(value, easing)
  return easing
}

export function getStepsEasing(step, pos = 'end') {
  return function (p, frames) {
    for(let i = 1; i < frames.length; i++) {
      const {offset} = frames[i]
      if(p <= offset) {
        const start = frames[i - 1].offset,
          end = offset
        const fp = (p - start) / (end - start),
          d = 1 / step

        let t = fp / d
        if(pos === 'end') {
          t = Math.floor(t)
        } else {
          t = Math.ceil(t)
        }

        return (d * t) * (end - start) + start
      }
    }
    return 0
  }
}

export function parseEasingStr(easingStr) {
  let pattern = /^cubic-bezier\((.*)\)/,
    matched = easingStr.match(pattern)

  if(matched) {
    let value = matched[1].trim()
    value = value.split(',').map(v => parseFloat(v.trim()))
    return getBezierEasing(...value)
  }

  pattern = /^steps\((.*)\)/
  matched = easingStr.match(pattern)

  if(matched) {
    let value = matched[1].trim()
    value = value.split(',').map(v => v.trim())
    const [step, pos] = value
    return getStepsEasing(parseInt(step, 10), pos)
  }
  return easingStr
}
