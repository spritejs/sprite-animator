import {nowtime} from './polyfill'
import updators from './updator'

const ERRMSG = {
  1001: 'At least two keyframes.',
  1002: 'Partial keyframes are not supported.',
}


const generateAnimation = function(frames, timing){
  if(typeof timing === 'number'){
    timing = {duration: timing}
  }

  //计算 offset
  let offset = 0, offsetFrom = -1
  
  const startFrame = frames[0],
        endFrame = frames[frames.length - 1]

  endFrame.offset = endFrame.offset || 1
  startFrame.offset = startFrame.offset || 0

  for(let i = 0; i < frames.length; i++){
    const frame = frames[i]
    if(frame.offset != null){
      const dis = i - offsetFrom
      if(dis > 1){
        const delta = (frame.offset - offset) / (dis)
        for(let j = 0; j < dis - 1; j++){
          frames[offsetFrom + j + 1].offset = offset + delta * (j + 1)
        }
      }
      offset = frame.offset
      offsetFrom = i
    } 
  }

  const startTime = nowtime()
  let {duration, delay, iterations, direction, easing, fill} = timing

  delay = delay | 0

  return (function *(){
    do {
      const p = (nowtime() - startTime - delay) / duration
      const ret = {}

      if(p <= 0){
        yield ret
        continue
      } else if(p >= 1){
        return endFrame
      }
      
      for(let i = 1; i < frames.length; i++){
        const frame = frames[i]
        if(frame.offset >= p){
          const previousFrame = frames[i - 1]
          
          for([key, value] of Object.entries(frame)){
            if(key !== 'offset'){
              const updator = updators[key] || updators.default
              ret[key] = updator(previousFrame[key], value, p, previousFrame.offset, frame.offset)
            }
          }
          break
        }
      }
      yield ret

    } while(1)
  })()
}


export {
  generateAnimation
}

