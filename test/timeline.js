import Timeline from '../lib/timeline'
import {nowtime} from '../lib/utils'

const test = require("ava")

function sleep(time) {
  return new Promise(resolve => setTimeout(resolve, time))
}

test('default timeline', async (t) => {
  const timeline = new Timeline()

  t.truthy(timeline.currentTime < 5)

  const current = nowtime()

  await sleep(50)

  t.truthy(Math.abs(timeline.currentTime - (nowtime() - current)) < 5)
})

test('timeline originTime', async (t) => {
  const timeline = new Timeline({originTime: 50})

  t.truthy(timeline.currentTime < -45)
  t.truthy(timeline.currentTime >= -50)

  await sleep(100)

  t.truthy(Math.abs(timeline.currentTime - 50) < 30)
})

test('timeline paused', async (t) => {
  const timeline = new Timeline()

  await sleep(50)

  timeline.playbackRate = 0
  const current = timeline.currentTime

  console.log('current: %s', current)

  await sleep(50)

  t.truthy(timeline.currentTime === current)
})

test('timeline playbackRate', async (t) => {
  const timeline = new Timeline()

  await sleep(50)

  timeline.playbackRate = 0
  console.log('current: %s', timeline.currentTime)
  await sleep(50)

  timeline.playbackRate = 2.0
  await sleep(50)
  console.log('current: %s', timeline.currentTime)

  timeline.playbackRate = -1.0
  await sleep(150)
  console.log('current: %s', timeline.currentTime)

  t.truthy(Math.abs(timeline.currentTime) <= 30)
})

test('timeline duration', async (t) => {
  const timeline = new Timeline()
  await sleep(50)

  timeline.playbackRate = 2.0
  await sleep(50)

  timeline.playbackRate = -3.0
  await sleep(50)

  console.log('current: %s', timeline.currentTime)
  console.log('duration: %s', timeline.duration)

  t.truthy(Math.abs(timeline.duration - 300) <= 150)
})

test('seek duration', async (t) => {
  const timeline = new Timeline()
  await sleep(50)

  timeline.playbackRate = 2.0
  await sleep(50)

  let idx = timeline.seekTimeMark(10)
  t.is(idx, 0)

  idx = timeline.seekTimeMark(70)
  t.is(idx, 1)

  timeline.currentTime = 3.0
  await sleep(100)
  idx = timeline.seekTimeMark(200)

  t.is(idx, 2)
})

test.cb('timeline setTimeout', t => {
  const timeline = new Timeline()
  timeline.setTimeout(() => {
    console.log('t, current: %s', timeline.currentTime)
    t.truthy(Math.abs(timeline.currentTime - 100) <= 30)
    t.end()
  }, 100)
})

test.cb('timeline setTimeout2', t => {
  const timeline = new Timeline({playbackRate: 2})

  const now = nowtime()
  
  setTimeout(() => {
    timeline.playbackRate = 1
  }, 200)

  timeline.setTimeout(() => {
    console.log('t2, current: %s', timeline.currentTime)
    console.log('t2, duration: %s', timeline.duration)
    console.log('t2, time: %s', nowtime() - now)
    t.truthy(Math.abs(nowtime() - now - 800) <= 100)
    t.end()
  }, 1000)
})
