export function nowtime(){
  if(typeof performance !== 'undefined' && performance.now){
    return performance.now();
  }
  return Date.now ? Date.now() : (new Date()).getTime();
}

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
  return val
}
