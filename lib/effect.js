export default {
  //s - startFrame, e - endFrame
  default(from, to, p, s, e){
    if(typeof from  === 'number' && typeof to === 'number'){
      return from + ((p - s) / (e - s)) * (to - from)
    }

    if(p >=  e){
      return to
    } else {
      return from
    }
  }
}
