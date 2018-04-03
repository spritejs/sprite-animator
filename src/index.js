import {defer, getBezierEasing, getStepsEasing, parseEasingStr, periodicity} from './utils'
import Effects from './effect'
import Timeline from 'sprite-timeline'

import Easings from './easing'

const assert = require('assert')

 // 计算 offset
function calculateFramesOffset(keyframes) {
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

const _timing = Symbol('timing'),
  _keyframes = Symbol('keyframes'),
  _initState = Symbol('initState'),
  _readyDefer = Symbol('readyDefer'),
  _finishedDefer = Symbol('finishedDefer'),
  _effects = Symbol('_effects')

/**
  easing: {
    type: 'cubic-bezier',
    value: [...]
  }
  easing: {
    type: 'steps',
    step: 1,
    pos: 'end'
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
  effect: null,
}

/**
  animation: play --> delay --> effect --> endDelay
  playState: idle --> pending --> running --> pending --> finished
 */
class Animator {
  constructor(initState, keyframes, timing) {
    if(Array.isArray(initState)) {
      // 如果 initState 缺省，默认 keyframes 的第一帧为 initState
      [initState, keyframes, timing] = [initState[0], initState, keyframes]
    }

    if(typeof timing === 'number') {
      timing = {duration: timing}
    }

    this[_timing] = Object.assign({}, defaultTiming, timing)

    const easing = this[_timing].easing
    if(typeof easing === 'string') {
      if(!Easings[easing]) {
        this[_timing].easing = parseEasingStr(easing)
      } else {
        this[_timing].easing = Easings[easing]
      }
    } else if(this[_timing].easing.type === 'cubic-bezier') {
      this[_timing].easing = getBezierEasing(...easing.value)
    } else if(this[_timing].easing.type === 'steps') {
      this[_timing].easing = getStepsEasing(easing.step, easing.pos)
    }

    this[_keyframes] = calculateFramesOffset(keyframes)

    const lastFrame = this[_keyframes][this[_keyframes].length - 1]

    this[_initState] = {} // 初始状态

    Object.keys(lastFrame).forEach((key) => {
      if(Object.prototype.hasOwnProperty.call(initState, key)) {
        this[_initState][key] = initState[key]
      }
    })

    if(this[_keyframes][0].offset !== 0) {
      // 要补第一帧
      const startFrame = Object.assign({}, this[_initState], {offset: 0})
      this[_keyframes].unshift(startFrame)
    }
    if(lastFrame.offset < 1) {
      // 要补最后一帧
      const endFrame = Object.assign({}, lastFrame, {offset: 1})
      this[_keyframes].push(endFrame)
    }

    this[_effects] = {}
    this.timeline = null // idle, no effect
  }

  get playbackRate() {
    return this[_timing].playbackRate
  }

  set playbackRate(rate) {
    if(this.timeline && this.playState !== 'paused') {
      this.timeline.playbackRate = rate
    }
    this[_timing].playbackRate = rate
  }

  get playState() {
    const timeline = this.timeline,
      {iterations, duration, endDelay} = this[_timing]

    if(timeline == null) {
      return 'idle'
    }

    if(timeline.playbackRate === 0) {
      return 'paused'
    }

    if(timeline.entropy < 0) { // 开始 pending
      return 'pending'
    }

    const ed = timeline.entropy - iterations * duration
    if(ed > 0 && ed < endDelay) { // 结束 pending
      return 'pending'
    }

    if(ed >= endDelay) {
      return 'finished'
    }

    return 'running'
  }

  get progress() {
    const {duration, iterations} = this[_timing]
    const timeline = this.timeline,
      entropy = timeline ? timeline.entropy : 0,
      playState = this.playState

    let p

    if(playState === 'idle') {
      p = 0
    } else if(playState === 'paused' && entropy < 0) {
      p = 0
    } else if(playState === 'pending') {
      if(entropy < 0) {
        p = 0
      } else {
        // return periodicity(iterations, 1)
        const time = timeline.seekLocalTime(iterations * duration)
        p = periodicity(time, duration) / duration
      }
    } else if(playState === 'running' || playState === 'paused') {
      p = periodicity(timeline.currentTime, duration) / duration
    }

    if(playState === 'finished') {
      p = periodicity(iterations, 1)
    }

    return p
  }

  get frame() {
    let p = this.progress

    const playState = this.playState,
      initState = this[_initState],
      {fill, direction, duration, easing, effect} = this[_timing]

    if(playState === 'idle') {
      return initState
    }

    const currentTime = this.timeline.currentTime,
      entropy = this.timeline.entropy,
      keyframes = this[_keyframes].slice(0)

    let inversed = false

    if(direction === 'reverse') {
      p = 1 - p
      inversed = true
    } else if(direction === 'alternate' || direction === 'alternate-reverse') {
      let period = Math.floor(currentTime / duration)

      if(p === 1) period--
      // period = Math.max(0, period)

      if((period % 2) ^ (direction === 'alternate-reverse')) {
        p = 1 - p
        inversed = true
      }
    }

    let ret = {}

    if(entropy < 0 && playState === 'pending') {
      if(fill === 'backwards' || fill === 'both') {
        return inversed ? keyframes[keyframes.length - 1] : keyframes[0]
      }
      return initState
    }

    if(playState === 'pending' || playState === 'finished') {
      if(fill !== 'forwards' && fill !== 'both') {
        return initState
      }
    }

    const effects = this[_effects]

    p = easing(p, keyframes)

    for(let i = 1; i < keyframes.length; i++) {
      const frame = keyframes[i],
        offset = frame.offset

      if(offset >= p || i === keyframes.length - 1) {
        const previousFrame = keyframes[i - 1],
          previousOffset = previousFrame.offset

        if(effect) {
          ret = effect(previousFrame, frame, p, previousOffset, offset)
        } else {
          for(const [key, value] of Object.entries(frame)) {
            if(key !== 'offset') {
              const effect = effects[key] || Effects[key] || Effects.default

              const v = effect(previousFrame[key], value, p, previousOffset, offset)

              if(v != null) {
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

  set baseTimeline(timeline) {
    this[_timing].timeline = timeline
  }

  get baseTimeline() {
    return this[_timing].timeline
  }

  play() {
    if(this.playState === 'finished') {
      this.cancel()
    }

    if(this.playState === 'idle') {
      const {delay, duration, iterations, endDelay, playbackRate, timeline} = this[_timing]
      this.timeline = new Timeline({
        originTime: delay,
        playbackRate,
      }, timeline)

      if(this[_readyDefer] && !this[_readyDefer].timerID) {
        this[_readyDefer].timerID = this.timeline.setTimeout(() => {
          this[_readyDefer].resolve()
          assert(this.playState === 'running' || this.playState === 'finished', `An error occured: ${this.playState}`)
          delete this[_readyDefer]
        }, {entropy: -this.timeline.entropy})
      }

      if(this[_finishedDefer] && !this[_finishedDefer].timerID) {
        this[_finishedDefer].timerID = this.timeline.setTimeout(() => {
          this[_finishedDefer].resolve()
        }, {entropy: duration * iterations + endDelay - this.timeline.entropy})
      }
    } else if(this.playState === 'paused') {
      this.timeline.playbackRate = this.playbackRate
      if(this[_readyDefer] && !this[_readyDefer].timerID) {
        this[_readyDefer].resolve()
        delete this[_readyDefer]
      }
    }
  }

  cancel() {
    if(this[_readyDefer]) {
      if(this.timeline) {
        this.timeline.clearTimeout(this[_readyDefer].timerID)
      }
      delete this[_readyDefer]
    }
    if(this[_finishedDefer]) {
      if(this.timeline) {
        this.timeline.clearTimeout(this[_finishedDefer].timerID)
      }
      delete this[_finishedDefer]
    }
    this.timeline = null
  }

  finish() {
    if(this.playState !== 'idle') {
      this.timeline.entropy = Infinity
      if(this[_readyDefer]) {
        this.timeline.clearTimeout(this[_readyDefer].timerID)
        delete this[_readyDefer]
      }
      if(this[_finishedDefer]) {
        this.timeline.clearTimeout(this[_finishedDefer].timerID)
        this[_finishedDefer].resolve()
        delete this[_finishedDefer]
      }
    } else {
      if(this[_readyDefer]) {
        delete this[_readyDefer]
      }
      if(this[_finishedDefer]) {
        this[_finishedDefer].resolve()
        delete this[_finishedDefer]
      }
    }
  }

  applyEffects(effects) {
    return Object.assign(this[_effects], effects)
  }

  get ready() {
    if(this[_readyDefer]) {
      return this[_readyDefer].promise
    }

    if(this.timeline && this.timeline.entropy >= 0) {
      if(this.playState !== 'paused') {
        return Promise.resolve()
      }
      this[_readyDefer] = defer()
      return this[_readyDefer].promise
    }
    this[_readyDefer] = defer()

    if(this.timeline) { // 已经在 pending 状态
      this[_readyDefer].timerID = this.timeline.setTimeout(() => {
        this[_readyDefer].resolve()
        assert(this.playState === 'running' || this.playState === 'finished', `An error occured: ${this.playState}`)
        delete this[_readyDefer]
      }, {entropy: -this.timeline.entropy})
    }

    return this[_readyDefer].promise
  }

  get finished() {
    if(this.playState === 'finished') {
      return Promise.resolve()
    }
    if(!this[_finishedDefer]) {
      this[_finishedDefer] = defer()

      const {duration, iterations, endDelay} = this[_timing]
      if(this.timeline) {
        this[_finishedDefer].timerID = this.timeline.setTimeout(() => {
          this[_finishedDefer].resolve()
        }, {entropy: duration * iterations + endDelay - this.timeline.entropy})
      }
    }

    return this[_finishedDefer].promise
  }
}

module.exports = {
  Animator,
  Easings,
  Effects,
  Timeline,
}
