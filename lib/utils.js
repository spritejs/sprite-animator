
export function defer(){
  const ret = {}
  ret.promise = new Promise((resolve, reject) => {
    ret.resolve = resolve
    ret.reject = reject
  })
  return ret
}

export function periodicity(val, dur){
  const t = Math.floor(val / dur)
  if(t){
    val -= t * dur
  }
  return val || dur
}

const BezierEasing = require('bezier-easing')
const bezierFuncCache = new Map()

export function getBezierEasing(...value){
  let easing = bezierFuncCache.get(value)
  if(easing){
    return easing
  }
  easing = BezierEasing(...value)
  bezierFuncCache.set(value, easing)
  return easing
}
