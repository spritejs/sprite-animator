
import Timeline from 'sprite-timeline';
import {defer, periodicity, calculateFramesOffset, getProgress, getCurrentFrame} from './utils';
import {parseEasing} from './easing';

const _timing = Symbol('timing'),
  _keyframes = Symbol('keyframes'),
  _initState = Symbol('initState'),
  _readyDefer = Symbol('readyDefer'),
  _finishedDefer = Symbol('finishedDefer'),
  _effects = Symbol('effects'),
  _activeReadyTimer = Symbol('activeReadyTimer'),
  _activeFinishTimer = Symbol('activeFinishTimer'),
  _removeDefer = Symbol('removeDefer');

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
};

/**
  animation: play --> delay --> effect --> endDelay
  playState: idle --> pending --> running --> pending --> finished
 */
export default class {
  constructor(initState, keyframes, timing) {
    if(Array.isArray(initState)) {
      // 如果 initState 缺省，默认 keyframes 的第一帧为 initState
      [initState, keyframes, timing] = [initState[0], initState, keyframes];
    }

    if(typeof timing === 'number') {
      timing = {duration: timing};
    }

    this[_timing] = Object.assign({}, defaultTiming, timing);
    this[_timing].easing = parseEasing(this[_timing].easing);
    this[_keyframes] = calculateFramesOffset(keyframes);

    const lastFrame = this[_keyframes][this[_keyframes].length - 1];

    this[_initState] = {}; // 初始状态

    Object.keys(lastFrame).forEach((key) => {
      if(Object.prototype.hasOwnProperty.call(initState, key)) {
        if(key !== 'easing' && key !== 'offset') {
          this[_initState][key] = initState[key];
        }
      }
    });

    // 补齐参数
    this[_keyframes] = this[_keyframes].map((frame) => {
      return Object.assign({}, this[_initState], frame);
    });

    if(this[_keyframes][0].offset !== 0) {
      // 要补第一帧
      this[_keyframes].unshift(Object.assign({}, this[_initState], {offset: 0}));
    }
    if(lastFrame.offset < 1) {
      // 要补最后一帧
      this[_keyframes].push(Object.assign({}, lastFrame, {offset: 1}));
    }

    this[_effects] = {};
    this.timeline = null; // idle, no effect
  }

  get playbackRate() {
    return this[_timing].playbackRate;
  }

  set playbackRate(rate) {
    if(this.timeline) {
      this.timeline.playbackRate = rate;
    }
    this[_timing].playbackRate = rate;
  }

  get playState() {
    const timeline = this.timeline,
      {iterations, duration, endDelay} = this[_timing];
    let state = 'running';

    if(timeline == null) {
      state = 'idle';
    } else if(timeline.paused) {
      state = 'paused';
    } else if(timeline.currentTime < 0) { // 开始 pending
      state = 'pending';
    } else {
      const ed = timeline.currentTime - iterations * duration;
      if(ed > 0 && ed < endDelay) { // 结束 pending
        state = 'pending';
      } else if(ed >= endDelay) {
        state = 'finished';
      }
    }
    return state;
  }

  get progress() {
    if(!this.timeline) return 0;

    const {duration, iterations} = this[_timing];
    const timeline = this.timeline,
      playState = this.playState;

    let p;

    if(playState === 'idle') {
      p = 0;
    } else if(playState === 'paused' && timeline.currentTime < 0) {
      p = 0;
    } else if(playState === 'pending') {
      if(timeline.currentTime < 0) {
        p = 0;
      } else {
        const time = timeline.seekLocalTime(iterations * duration);
        p = periodicity(time, duration)[1] / duration;
      }
    } else if(playState === 'running' || playState === 'paused') {
      p = periodicity(timeline.currentTime, duration)[1] / duration;
    }

    if(playState === 'finished') {
      p = periodicity(iterations, 1)[1];
    }

    return p;
  }

  get frame() {
    const playState = this.playState,
      initState = this[_initState],
      {fill} = this[_timing];

    if(playState === 'idle') {
      return initState;
    }

    const {currentTime} = this.timeline,
      keyframes = this[_keyframes].slice(0);

    const {p, inverted} = getProgress(this.timeline, this[_timing], this.progress);

    let frameState = initState;
    if(currentTime < 0 && playState === 'pending') {
      // 在开始前 delay 阶段
      if(fill === 'backwards' || fill === 'both') {
        frameState = inverted ? keyframes[keyframes.length - 1] : keyframes[0];
      }
    } else if((playState !== 'pending' && playState !== 'finished')
      || fill === 'forwards' || fill === 'both') {
      // 不在 endDelay 或结束状态，或 forwards
      frameState = getCurrentFrame(this[_timing], keyframes, this[_effects], p);
    }
    return frameState;
  }

  get timing() {
    return this[_timing];
  }

  pause() {
    this.timeline.playbackRate = 0;
  }

  set baseTimeline(timeline) {
    this[_timing].timeline = timeline;
  }

  get baseTimeline() {
    return this[_timing].timeline;
  }

  [_activeReadyTimer]() {
    if(this[_readyDefer] && !this[_readyDefer].timerID) {
      if(this.timeline.currentTime < 0) {
        this[_readyDefer].timerID = this.timeline.setTimeout(() => {
          this[_readyDefer].resolve();
          delete this[_readyDefer];
        }, {delay: -this.timeline.currentTime, heading: false});
      } else {
        this[_readyDefer].timerID = this.timeline.setTimeout(() => {
          this[_readyDefer].resolve();
          delete this[_readyDefer];
        }, {delay: 0, isEntropy: true});
      }
    }
  }

  [_activeFinishTimer]() {
    const {duration, iterations, endDelay} = this[_timing];
    const delay = Math.ceil(duration * iterations + endDelay - this.timeline.currentTime) + 1;
    if(this[_finishedDefer] && !this[_finishedDefer].timerID) {
      this[_finishedDefer].timerID = this.timeline.setTimeout(() => {
        this[_finishedDefer].resolve();
        this[_removeDefer](_readyDefer);
        this[_removeDefer](_finishedDefer);
      }, {delay, heading: false});
      this[_finishedDefer].reverseTimerID = this.timeline.setTimeout(() => {
        this[_finishedDefer].resolve();
        this[_removeDefer](_readyDefer);
        this[_removeDefer](_finishedDefer);
        this.timeline = null;
      }, {delay: -this[_timing].delay - 1, heading: false});
    }
  }

  play() {
    if(this.playState === 'finished') {
      this.cancel();
    }

    if(this.playState === 'idle') {
      if(this.playbackRate <= 0) {
        return;
      }
      const {delay, playbackRate, timeline} = this[_timing];
      this.timeline = new Timeline({
        originTime: delay,
        playbackRate,
      }, timeline);
      this[_activeReadyTimer]();
      this[_activeFinishTimer]();
    } else if(this.playState === 'paused') {
      this.timeline.playbackRate = this.playbackRate;
      this[_activeReadyTimer]();
    }
  }

  [_removeDefer](deferID) {
    const defered = this[deferID],
      {timeline} = this;

    if(defered && timeline) {
      timeline.clearTimeout(defered.timerID);
      if(defered.reverseTimerID) {
        timeline.clearTimeout(defered.reverseTimerID);
      }
    }
    delete this[deferID];
  }

  cancel() {
    this[_removeDefer](_readyDefer);
    this[_removeDefer](_finishedDefer);
    this.timeline = null;
  }

  finish() {
    this.timeline.currentTime = Infinity / this.playbackRate;
    this[_removeDefer](_readyDefer);
    this[_removeDefer](_finishedDefer);
  }

  applyEffects(effects) {
    return Object.assign(this[_effects], effects);
  }

  get ready() {
    if(this[_readyDefer]) {
      return this[_readyDefer].promise;
    }

    if(this.timeline && this.timeline.currentTime >= 0) {
      if(this.playState !== 'paused') {
        return Promise.resolve();
      }
    }

    this[_readyDefer] = defer();
    if(this.timeline) { // 已经在 pending 状态
      this[_activeReadyTimer]();
    }
    if(this[_readyDefer]) {
      return this[_readyDefer].promise;
    }
    return Promise.resolve();
  }

  get finished() {
    if(this.playState === 'finished') {
      return Promise.resolve();
    }
    if(!this[_finishedDefer]) {
      this[_finishedDefer] = defer();

      if(this.timeline) {
        this[_activeFinishTimer]();
      }
    }

    return this[_finishedDefer].promise;
  }
}