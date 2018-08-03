import {parseEasing} from './easing';

import Effects from './effect';

export function defer() {
  const ret = {};
  ret.promise = new Promise((resolve, reject) => {
    ret.resolve = resolve;
    ret.reject = reject;
  });
  return ret;
}

export function periodicity(val, dur) {
  let t = Math.floor(val / dur);
  let v = val - t * dur;
  if(v === 0 && t > 0) {
    v = dur;
    t--;
  }
  return [t, v];
}

export function calculateFramesOffset(keyframes) {
  keyframes = keyframes.slice(0);

  const firstFrame = keyframes[0],
    lastFrame = keyframes[keyframes.length - 1];

  lastFrame.offset = lastFrame.offset || 1;
  firstFrame.offset = firstFrame.offset || 0;

  let offset = 0,
    offsetFrom = -1;

  for(let i = 0; i < keyframes.length; i++) {
    const frame = keyframes[i];
    if(frame.offset != null) {
      const dis = i - offsetFrom;
      if(dis > 1) {
        const delta = (frame.offset - offset) / (dis);
        for(let j = 0; j < dis - 1; j++) {
          keyframes[offsetFrom + j + 1].offset = offset + delta * (j + 1);
        }
      }
      offset = frame.offset;
      offsetFrom = i;
    }
    if(frame.easing != null) {
      frame.easing = parseEasing(frame.easing);
    }
    if(i > 0) {
      const hasEasing = keyframes[i].easing != null;
      // 如果中间某个属性没有了，需要从前一帧复制过来
      keyframes[i] = Object.assign({}, keyframes[i - 1], keyframes[i]);
      if(!hasEasing) { // easing 不能复制
        delete keyframes[i].easing;
      }
    }
  }

  return keyframes;
}

export function getProgress(timeline, timing, p) {
  const {currentTime} = timeline,
    {direction, duration} = timing;
  let inverted = false;
  if(direction === 'reverse') {
    p = 1 - p;
    inverted = true;
  } else if(direction === 'alternate' || direction === 'alternate-reverse') {
    let period = Math.floor(currentTime / duration);

    if(p === 1) period--;
    // period = Math.max(0, period)

    if((period % 2) ^ (direction === 'alternate-reverse')) {
      p = 1 - p;
      inverted = true;
    }
  }
  return {p, inverted};
}

function calculateFrame(previousFrame, nextFrame, effects, p) {
  const ret = {};
  Object.entries(nextFrame).forEach(([key, value]) => {
    if(key !== 'offset' && key !== 'easing') {
      const effect = effects[key] || effects.default;

      const v = effect(previousFrame[key], value, p, previousFrame.offset, nextFrame.offset);

      if(v != null) {
        ret[key] = v;
      }
    }
  });
  return ret;
}

export function getCurrentFrame(timing, keyframes, effects, p) {
  const {easing, effect} = timing;

  if(!effect) {
    // timing.effect 会覆盖掉 Effects 和 animator.applyEffects 中定义的 effects
    effects = Object.assign({}, effects, Effects);
  }

  let ret = {};

  p = easing(p, keyframes);

  for(let i = 1; i < keyframes.length; i++) {
    const frame = keyframes[i],
      offset = frame.offset;

    if(offset >= p || i === keyframes.length - 1) {
      const previousFrame = keyframes[i - 1],
        previousOffset = previousFrame.offset,
        easing = previousFrame.easing;

      let ep = p;
      if(easing) {
        const d = offset - previousOffset;
        ep = easing((p - previousOffset) / d) * d + previousOffset;
      }

      if(effect) {
        ret = effect(previousFrame, frame, ep, previousOffset, offset);
      } else {
        ret = calculateFrame(previousFrame, frame, effects, ep);
      }
      break;
    }
  }

  return ret;
}
