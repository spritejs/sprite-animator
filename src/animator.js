
import {defer, periodicity, calculateFramesOffset, getProgress, getCurrentFrame} from './utils'
import Timeline from 'sprite-timeline'
import {parseEasing} from './easing'

const assert = require('assert')

const _timing = Symbol('timing'),
  _keyframes = Symbol('keyframes'),
  _initState = Symbol('initState'),
  _readyDefer = Symbol('readyDefer'),
  _finishedDefer = Symbol('finishedDefer'),
  _effects = Symbol('_effects'),
  _applyReadyTimer = Symbol('applyReadyTimer'),
  _applyFinishTimer = Symbol('applyFinishTimer'),
  _removeDefer = Symbol('removeDefer')

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
export default class {
  constructor(initState, keyframes, timing) {
    if(Array.isArray(initState)) {
      // 如果 initState 缺省，默认 keyframes 的第一帧为 initState
      [initState, keyframes, timing] = [initState[0], initState, keyframes]
    }

    if(typeof timing === 'number') {
      timing = {duration: timing}
    }

    this[_timing] = Object.assign({}, defaultTiming, timing)
    this[_timing].easing = parseEasing(this[_timing].easing)
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
    let state = 'running'

    if(timeline == null) {
      state = 'idle'
    } else if(timeline.playbackRate === 0) {
      state = 'paused'
    } else if(timeline.entropy < 0) { // 开始 pending
      state = 'pending'
    } else {
      const ed = timeline.entropy - iterations * duration
      if(ed > 0 && ed < endDelay) { // 结束 pending
        state = 'pending'
      } else if(ed >= endDelay) {
        state = 'finished'
      }
    }
    return state
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
        const time = timeline.seekLocalTime(iterations * duration)
        p = periodicity(time, duration)[1] / duration
      }
    } else if(playState === 'running' || playState === 'paused') {
      p = periodicity(timeline.currentTime, duration)[1] / duration
    }

    if(playState === 'finished') {
      p = periodicity(iterations, 1)[1]
    }

    return p
  }

  get frame() {
    const playState = this.playState,
      initState = this[_initState],
      {fill} = this[_timing]

    if(playState === 'idle') {
      return initState
    }

    const {entropy} = this.timeline,
      keyframes = this[_keyframes].slice(0)

    const {p, inverted} = getProgress(this.timeline, this[_timing], this.progress)

    let frameState = initState
    if(entropy < 0 && playState === 'pending') {
      // 在开始前 delay 阶段
      if(fill === 'backwards' || fill === 'both') {
        frameState = inverted ? keyframes[keyframes.length - 1] : keyframes[0]
      }
    } else if((playState !== 'pending' && playState !== 'finished')
      || fill === 'forwards' || fill === 'both') {
      // 不在 endDelay 或结束状态，或 forwards
      frameState = getCurrentFrame(this[_timing], keyframes, this[_effects], p)
    }
    return frameState
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

  [_applyReadyTimer]() {
    if(this[_readyDefer] && !this[_readyDefer].timerID) {
      this[_readyDefer].timerID = this.timeline.setTimeout(() => {
        this[_readyDefer].resolve()
        assert(this.playState === 'running' || this.playState === 'finished', `An error occured: ${this.playState}`)
        delete this[_readyDefer]
      }, {entropy: -this.timeline.entropy})
    }
  }

  [_applyFinishTimer]() {
    const {duration, iterations, endDelay} = this[_timing]
    if(this[_finishedDefer] && !this[_finishedDefer].timerID) {
      this[_finishedDefer].timerID = this.timeline.setTimeout(() => {
        this[_finishedDefer].resolve()
      }, {entropy: duration * iterations + endDelay - this.timeline.entropy})
    }
  }

  play() {
    if(this.playState === 'finished') {
      this.cancel()
    }

    if(this.playState === 'idle') {
      const {delay, playbackRate, timeline} = this[_timing]
      this.timeline = new Timeline({
        originTime: delay,
        playbackRate,
      }, timeline)

      if(this[_readyDefer] && !this[_readyDefer].timerID) {
        this[_applyReadyTimer]()
      }

      this[_applyFinishTimer]()
    } else if(this.playState === 'paused') {
      this.timeline.playbackRate = this.playbackRate
      if(this[_readyDefer] && !this[_readyDefer].timerID) {
        this[_readyDefer].resolve()
        delete this[_readyDefer]
      }
    }
  }

  [_removeDefer](deferID) {
    const defered = this[deferID],
      {timeline} = this

    if(defered && timeline) {
      timeline.clearTimeout(defered.timerID)
    }
    delete this[deferID]
  }

  cancel() {
    this[_removeDefer](_readyDefer)
    this[_removeDefer](_finishedDefer)
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
      this[_applyReadyTimer]()
    }

    return this[_readyDefer].promise
  }

  get finished() {
    if(this.playState === 'finished') {
      return Promise.resolve()
    }
    if(!this[_finishedDefer]) {
      this[_finishedDefer] = defer()

      if(this.timeline) {
        this[_applyFinishTimer]()
      }
    }

    return this[_finishedDefer].promise
  }
}