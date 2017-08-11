const test = require("ava")
import {parseEasingStr, getBezierEasing, getStepsEasing} from '../lib/utils'

test('parse bezierEasing', t => {
  const easing = parseEasingStr('cubic-bezier(0.68, -0.55, 0.265, 1.55)')

  const bezierEasing = getBezierEasing(0.68, -0.55, 0.265, 1.55)
  t.is(easing(0.618), bezierEasing(0.618))
})

test('parse stepsEasing', t => {
  const easing = parseEasingStr('steps(5, start)')

  const stepsEasing = getStepsEasing(5, 'start')
  t.is(easing(0.618, [{offset:0}, {offset:1}]), stepsEasing(0.618, [{offset:0}, {offset:1}]))
})
