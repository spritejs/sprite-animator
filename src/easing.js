const BezierEasing = require('bezier-easing');
const bezierFuncCache = new Map();

function getBezierEasing(...value) {
  let easing = bezierFuncCache.get(value);
  if(easing) {
    return easing;
  }
  easing = BezierEasing(...value);
  bezierFuncCache.set(value, easing);
  return easing;
}

function getStepsEasing(step, pos = 'end') {
  return function (p, frames) {
    for(let i = 1; i < frames.length; i++) {
      const {offset} = frames[i];
      if(p <= offset) {
        const start = frames[i - 1].offset,
          end = offset;
        const fp = (p - start) / (end - start),
          d = 1 / step;

        let t = fp / d;
        if(pos === 'end') {
          t = Math.floor(t);
        } else {
          t = Math.ceil(t);
        }

        return (d * t) * (end - start) + start;
      }
    }
    return 0;
  };
}

function parseEasingStr(easingStr) {
  let pattern = /^cubic-bezier\((.*)\)/,
    matched = easingStr.match(pattern);

  if(matched) {
    let value = matched[1].trim();
    value = value.split(',').map(v => parseFloat(v.trim()));
    return getBezierEasing(...value);
  }

  pattern = /^steps\((.*)\)/;
  matched = easingStr.match(pattern);

  if(matched) {
    let value = matched[1].trim();
    value = value.split(',').map(v => v.trim());
    const [step, pos] = value;
    return getStepsEasing(parseInt(step, 10), pos);
  }
  return easingStr;
}

const Easings = {
  linear(p) {
    return p;
  },
  ease: getBezierEasing(0.25, 0.1, 0.25, 1),
  'ease-in': getBezierEasing(0.42, 0, 1, 1),
  'ease-out': getBezierEasing(0, 0, 0.58, 1),
  'ease-in-out': getBezierEasing(0.42, 0, 0.58, 1),
  // 'step-start': function(p, frames){
  //   let ret = 0
  //   for(let i = 0; i < frames.length; i++){
  //     const {offset} = frames[i]
  //     ret = offset
  //     if(p < offset){
  //       break
  //     }
  //   }
  //   return ret
  // },
  // 'step-end': function(p, frames){
  //   let ret = 0
  //   for(let i = 0; i < frames.length; i++){
  //     const {offset} = frames[i]
  //     if(p < offset){
  //       break
  //     }
  //     ret = offset
  //   }
  //   return ret
  // }
  'step-start': getStepsEasing(1, 'start'),
  'step-end': getStepsEasing(1, 'end'),
};

function parseEasing(easing) {
  if(typeof easing === 'string') {
    if(!Easings[easing]) {
      easing = parseEasingStr(easing);
    } else {
      // load default Easing
      easing = Easings[easing];
    }
  } else if(easing.type === 'cubic-bezier') {
    easing = getBezierEasing(...easing.value);
  } else if(easing.type === 'steps') {
    easing = getStepsEasing(easing.step, easing.pos);
  }
  return easing;
}

export {
  Easings,
  parseEasing,
};
