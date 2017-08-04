import {nowtime} from './polyfill'
import updators from './updator'

const Signal = require('await-signal')

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

  const createTime = nowtime()
  let {duration, delay, iterations, direction, easing, fill} = timing

  delay = delay | 0

  let p = 0
  let idleTime = 0, pausedTime = 0

  let finished = 0

  let signal = new Signal('idle')

  let iterator = (function *(){
    do {
      const ret = {}
      if(signal.state !== 'running' && signal.state !== 'pending'){
        yield ret
        continue
      }

      p = (nowtime() - createTime - delay - idleTime) / duration

      if(p < 0){
        yield ret
        signal.state = 'pending'
        continue
      } else if(p >= 1){
        signal.state = 'finished'
        return endFrame
      } else {
        signal.state = 'running'
      }
      
      for(let i = 1; i < frames.length; i++){
        const frame = frames[i]
        if(frame.offset >= p){
          const previousFrame = frames[i - 1]
          
          for([key, value] of Object.entries(frame)){
            if(key !== 'offset'){
              const updator = updators[key] || updators.default
              const v = updator(previousFrame[key], value, p, previousFrame.offset, frame.offset)
              if(v != null){
                ret[key] = v
              }
            }
          }
          break
        }
      }
      yield ret

    } while(1)
  })()

  iterator.pause = function(){
    if(signal.state === 'running'){
      pausedTime = nowtime()
      signal.state = 'paused'
    }
  }

  iterator.resume = iterator.play = function(){
    if(signal.state === 'paused' || signal.state === 'idle'){
      idleTime += nowtime() - (pausedTime || createTime)
      signal.state = 'pending'
    }
  }

  iterator.signal = signal
  
  return iterator
}


export {
  generateAnimation
}

