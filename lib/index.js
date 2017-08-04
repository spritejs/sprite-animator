import {nowtime} from './polyfill'
import updators from './updator'

const Signal = require('await-signal')

const ERRMSG = {
  1001: 'At least two keyframes.',
  1002: 'Partial keyframes are not supported.',
}

 //计算 offset
function calculateFramesOffset(frames){
  frames = frames.slice(0)

  const firstFrame = frames[0],
        lastFrame = frames[frames.length - 1]

  lastFrame.offset = lastFrame.offset || 1
  firstFrame.offset = firstFrame.offset || 0

  let offset = 0, offsetFrom = -1

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
    if(i > 0){
      //如果中间某个属性没有了，需要从前一帧复制过来
      frames[i] = Object.assign({}, frames[i - 1], frames[i])
    } 
  }

  return frames    
}

const _timing = Symbol('timing'),
      _frames = Symbol('frames'),
      _iterator = Symbol('iterator'),
      _createTime = Symbol('createTime'),
      _idleTime = Symbol('idleTime'),
      _pausedTime = Symbol('pausedTime')

const defaultTiming = {
  delay: 0,
}

class Animator extends Signal{
  constructor(frames, timing){
    super('idle')

    if(typeof timing === 'number'){
      timing = {duration: timing}
    }
    timing = Object.assign({}, defaultTiming, timing)

    this[_frames] = calculateFramesOffset(frames)
    this[_timing] = timing
    this[_createTime] = nowtime()

    let {duration, delay, iterations, direction, easing, fill} = timing

    let p = 0

    this[_idleTime] = this[_pausedTime] = 0

    const that = this
    
    this.iterator = (function *(){
      do {
        const ret = {}
        if(that.state !== 'running' && that.state !== 'pending'){
          yield ret
          continue
        }

        p = (nowtime() - that[_createTime] - delay - that[_idleTime]) / duration

        const frames = that[_frames]

        if(p < 0){
          yield ret
          that.state = 'pending'
          continue
        } else if(p >= 1){
          that.state = 'finished'
          return frames[frames.length - 1]
        } else {
          that.state = 'running'
        }

        for(let i = 1; i < frames.length; i++){
          const frame = frames[i]
          if(frame.offset >= p){
            const previousFrame = frames[i - 1]
            
            for([key, value] of Object.entries(frame)){
              if(key !== 'offset'){
                const updator = updators[key] || updators.default
                const previousValue = previousFrame[key]
                if(previousValue != value){
                  const v = updator(previousFrame[key], value, p, previousFrame.offset, frame.offset)
                  if(v != null){
                    ret[key] = v
                  }
                }
              }
            }
            break
          }
        }
        yield ret

      } while(1)
    })()
  }
  pause(){
    if(this.state === 'running'){
      this[_pausedTime] = nowtime()
      this.state = 'paused'
    }
  }
  play(){
    if(this.state === 'paused' || this.state === 'idle'){
      this[_idleTime] += nowtime() - (this[_pausedTime] || this[_createTime])
      const t = this[_timing].delay + this[_idleTime] - (nowtime() - this[_createTime])
      if(t > 0){
        this.state = 'pending'
        setTimeout(() => {
          this.state = 'running'
        }, t)
      } else {
        this.state = 'running'
      }
    }
  }
  resume(){
    return this.play()
  }
  next(){
    return this.iterator.next()
  }
  [Symbol.iterator](){
    return this.iterator
  }
}

function generateAnimation(frames, timing){
  return new Animator(frames, timing)
}

export {
  generateAnimation,
}
