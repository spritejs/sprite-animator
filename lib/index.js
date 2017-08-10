import {defer, getBezierEasing, periodicity} from './utils'
import animationEffects from './effect'
import Timeline from 'sprite-timeline'

import easings from './easing'

const assert = require('assert')

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

function reverseFrame(frames){
  frames = frames.slice(0).reverse()

  return frames.map(frame => Object.assign({}, frame, {offset: 1 - frame.offset}))
}

const _timing = Symbol('timing'),
      _frames = Symbol('frames'),
      _reversedFrames = Symbol('reversedFrames'),
      _initState = Symbol('initState'),
      _readyDefer = Symbol('readyDefer'),
      _finishedDefer = Symbol('finishedDefer'),
      _effects = Symbol('_effects')

/**
  easing: {
    type: 'cubic-bezier',
    value: [...]
  }
 */
const defaultTiming = {
  delay: 0,
  endDelay: 0,
  fill: 'auto',
  iterations: 1.0,
  playbackRate: 1.0,
  direction: 'normal',
  easing: 'linear',
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
    
    if(typeof this[_timing].easing === 'string'){
      this[_timing].easing = easings[this[_timing].easing]
    } else if(this[_timing].easing.type === 'cubic-bezier'){
      this[_timing].easing = getBezierEasing(...this[_timing].easing.value)
    }

    this[_frames] = calculateFramesOffset(frames)
    this[_reversedFrames] = reverseFrame(frames)

    const lastFrame = this[_frames][this[_frames].length - 1]

    this[_initState] = {} // 初始状态
    for(let [key, value] of Object.entries(lastFrame)){
      if(initState.hasOwnProperty(key)){
        this[_initState][key] = initState[key]
      }
    }

    this[_effects] = Object.assign({}, Animator.animationEffects)
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

    let p

    if(this.playState === 'idle') {
      p = 0
    } else if(this.playState === 'paused' && timeline.entropy < 0){
      p = 0
    } else if(this.playState === 'pending') {
      if(timeline.entropy < 0){
        p = 0
      } else {
        //return periodicity(iterations, 1)
        const time = timeline.seekLocalTime(iterations * duration)
        p = periodicity(time, duration) / duration
      }
    } else if(this.playState === 'running' || this.playState === 'paused') {
      p = periodicity(timeline.currentTime, duration) / duration
    } 

    if(this.playState === 'finished') {
      p = periodicity(iterations, 1)
    }

    return p
  }

  get frame() {
    let p = this.progress

    const playState = this.playState,
          initState = this[_initState],
          {fill, iterations, direction, endDelay, delay, duration, easing} = this[_timing]

    if(playState === 'idle') {
      return initState
    }

    let frames;

    if(direction === 'normal'){
      frames = this[_frames].slice(0)
      p = easing(p)
    } else if(direction === 'reverse'){
      frames = this[_reversedFrames].slice(0)
      p = 1 - easing(1 - p)
    } else if(direction === 'alternate' || direction === 'alternate-reverse') {
      const entropy = this.timeline.entropy
      let period = Math.floor(entropy / duration)

      if(p === 1) period--
      period = Math.max(0, period)

      if((period % 2) ^ (direction === 'alternate-reverse')){
        frames = this[_reversedFrames].slice(0)
        p = 1 - easing(1 - p)
      } else {
        frames = this[_frames].slice(0)
        p = easing(p)
      }
    }

    let ret = {}

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

    let effects = this[_effects]

    for(let i = 1; i < frames.length; i++){
      const frame = frames[i],
            offset = frame.offset

      if(offset >= p || i === frames.length - 1){
        const previousFrame = frames[i - 1]
        
        for([key, value] of Object.entries(frame)){
          if(key !== 'offset'){
            const effect = effects[key] || effects.default
            const previousValue = previousFrame[key],
                  previousOffset = previousFrame.offset

            //if(previousValue != value){
            const v = effect(previousFrame[key], value, p, previousOffset, offset)
            if(v != null){
              ret[key] = v
            }
            //}
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
    if(this.playState === 'idle'){
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
    if(this.playState !== 'idle'){
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
    } else {
      if(this[_readyDefer]){
        delete this[_readyDefer]
      }
      if(this[_finishedDefer]){
        this[_finishedDefer].resolve()
        delete this[_finishedDefer] 
      }     
    }
  }

  applyEffects(effects) {
    return Object.assign(this[_effects], effects)
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
          assert(this.playState === 'running', `An error occured: ${this.playState}`)
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

Animator.animationEffects = animationEffects

export {
  Animator,
}
