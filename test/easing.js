const test = require("ava")
import {parseEasing} from '../lib/easing'
const BezierEasing = require('bezier-easing')

test('parse bezierEasing', t => {
  const easing = parseEasing('cubic-bezier(0.68, -0.55, 0.265, 1.55)')
  t.is(easing(0.618), BezierEasing(0.68, -0.55, 0.265, 1.55)(0.618))
})

test('parse stepsEasing', t => {
  const easing = parseEasing('steps(5, start)')

  t.truthy(easing(0.618, [{offset:0}, {offset:1}]) - 0.8 < 0.001)
  t.truthy(easing(0.599, [{offset:0}, {offset:1}]) - 0.6 < 0.001)
})
