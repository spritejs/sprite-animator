import {nowtime, defer, periodicity} from './utils'
import effects from './effect'
import Timeline from './timeline'

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
      _reversedFrames = Symbol('reversedFrames'),
      _initState = Symbol('initState'),
      _readyDefer = Symbol('readyDefer'),
      _finishedDefer = Symbol('finishedDefer')


const defaultTiming = {
  delay: 0,
  endDelay: 0,
  fill: 'auto',
  iterations: 1.0,
  playbackRate: 1.0,
}

/**
  animation: play --> delay --> effect --> endDelay 
  playState: idle --> pending --> running --> pending --> finished
 */
class Animator {
  constructor(initState, frames, timing){
    if(Array.isArray(initState)){ 
      // 如果 initState 缺省，默认 frames 的第一帧为 initState
      [initState, frames, timing] = [initState[0], initState, frames]
    }

    if(typeof timing === 'number'){
      timing = {duration: timing}
    }

    this[_timing] = Object.assign({}, defaultTiming, timing)
    this[_frames] = calculateFramesOffset(frames)

    const lastFrame = this[_frames][this[_frames].length - 1]

    this[_initState] = {} // 初始状态
    for(let [key, value] of Object.entries(lastFrame)){
      if(initState.hasOwnProperty(key)){
        this[_initState][key] = initState[key]
      }
    }

    this.timeline = null //idle, no effect
  }

  get playbackRate() {
    return this[_timing].playbackRate
  }

  set playbackRate(rate) {
    if(this.timeline && this.playState !== 'paused'){
      this.timeline.playbackRate = rate
    }
    this[_timing].playbackRate = rate
  }

  get playState(){
    const timeline = this.timeline,
          {iterations, duration, endDelay} = this[_timing]

    if(timeline == null){
      return 'idle'
    } 
    
    if(timeline.playbackRate === 0){
      return 'paused'
    }

    if(timeline.entropy < 0){ // 开始 pending
      return 'pending'
    }
    
    const ed = timeline.entropy - iterations * duration
    if(ed > 0 && ed < endDelay) { // 结束 pending
      return 'pending'
    } 

    if(ed >= endDelay){
      return 'finished'
    }

    return 'running'    
  }
  
  get progress() {
    let {duration, iterations} = this[_timing]
    const timeline = this.timeline

    if(this.playState === 'idle') {
      return 0
    }

    if(this.playState === 'paused' && timeline.entropy < 0){
      return 0
    }

    if(this.playState === 'pending') {
      if(timeline.entropy < 0){
        return 0
      } else {
        //return periodicity(iterations, 1)
        const time = timeline.seekLocalTime(iterations * duration)
        return periodicity(time, duration) / duration
      }
    } 
    
    if(this.playState === 'running' || this.playState === 'paused') {
      return  periodicity(timeline.currentTime, duration) / duration
    } 

    if(this.playState === 'finished') {
      return iterations
    }
  }

  get frame() {
    let p = this.progress

    const playState = this.playState,
          playbackRate = this.playbackRate,
          initState = this[_initState],
          {fill, iterations, endDelay} = this[_timing]

    let frames = this[_frames].slice(0)

    let ret = {}

    if(playState === 'idle') {
      return initState
    }

    if(p <= 0 && playState === 'pending') {
      if(fill === 'backwards' || fill === 'both') {
        return frames[0]
      } else {
        return initState
      }
    }

    if(playState === 'pending') {
      if(fill !== 'forwards' && fill !== 'both') {
        return initState
      }
    }

    for(let i = 1; i < frames.length; i++){
      const frame = frames[i],
            offset = frame.offset

      if(offset >= p){
        const previousFrame = frames[i - 1]
        
        for([key, value] of Object.entries(frame)){
          if(key !== 'offset'){
            const effect = effects[key] || effects.default
            const previousValue = previousFrame[key],
                  previousOffset = previousFrame.offset
            if(previousValue != value){
              const v = effect(previousFrame[key], value, p, previousOffset, offset)
              if(v != null){
                ret[key] = v
              }
            }
          }
        }
        break
      }
    }

    return ret
  }

  pause() {
    this.timeline.playbackRate = 0
  }  

  play() {
    if(this.playState === 'idle' || this.playState === 'finished'){
      let {delay, duration, iterations, endDelay, playbackRate} = this[_timing]
      this.timeline = new Timeline({
        originTime: delay,
        playbackRate: playbackRate,
      })

      if(this[_readyDefer] && !this[_readyDefer].timerID) {
        this[_readyDefer].timerID =  this.timeline.setTimeout(() => {
          this[_readyDefer].resolve()
          delete this[_readyDefer]
        }, {entropy: -this.timeline.entropy})
      }

      if(this[_finishedDefer] && !this[_finishedDefer].timerID) {
        this[_finishedDefer].timerID = this.timeline.setTimeout(() => {
          this[_finishedDefer].resolve()
        }, {entropy: duration * iterations + endDelay - this.timeline.entropy})
      }
    } else if(this.playState === 'paused'){
      this.timeline.playbackRate = this.playbackRate
      if(this[_readyDefer] && !this[_readyDefer].timerID){
        this[_readyDefer].resolve()
        delete this[_readyDefer]        
      }
    }
  }

  cancel() {
    if(this[_readyDefer]){
      if(this.timeline){
        this.timeline.clearTimeout(this[_readyDefer].timerID)
      }
      delete this[_readyDefer]
    }
    if(this[_finishedDefer]){
      if(this.timeline){
        this.timeline.clearTimeout(this[_finishedDefer].timerID)
      }
      delete this[_finishedDefer]
    }
    this.timeline = null
  }

  finish() {
    this.timeline.entropy = Infinity
    if(this[_readyDefer]){
      this.timeline.clearTimeout(this[_readyDefer].timerID)
      delete this[_readyDefer]
    }
    if(this[_finishedDefer]){
      this.timeline.clearTimeout(this[_finishedDefer].timerID)
      this[_finishedDefer].resolve()
      delete this[_finishedDefer]
    }
  }

  get ready(){
    if(this[_readyDefer]){
      return this[_readyDefer].promise
    }

    if(this.timeline && this.timeline.entropy >= 0){
      if(this.playState !== 'paused'){
        return Promise.resolve()
      } else {
        this[_readyDefer] = defer()
        return this[_readyDefer].promise
      }
    } else {
      this[_readyDefer] = defer()

      if(this.timeline){ //已经在 pending 状态
        this[_readyDefer].timerID =  this.timeline.setTimeout(() => {
          this[_readyDefer].resolve()
          delete this[_readyDefer]
        }, {entropy: -this.timeline.entropy})
      }

      return this[_readyDefer].promise
    }
  }

  get finished(){
    if(this.playState === 'finished'){
      return Promise.resolve()
    } else {
      if(!this[_finishedDefer]){
        this[_finishedDefer] = defer()

        const {duration, iterations, endDelay} = this[_timing]
        if(this.timeline){
          this[_finishedDefer].timerID = this.timeline.setTimeout(() => {
            this[_finishedDefer].resolve()
          }, {entropy: duration * iterations + endDelay - this.timeline.entropy})
        }
      }

      return this[_finishedDefer].promise
    }
  }
}

export {
  Animator,
}
