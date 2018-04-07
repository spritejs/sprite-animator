const test = require("ava")
const colors = require('colors')

import {Animator} from '../lib/index'

function sleep(time) {
  const startTime = Date.now()
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(Date.now() - startTime)
    }, time)
  })
}


function makeTimeCompare(caseID, startTime){
  return function(actual, expect, passedTime = Math.max(Date.now() - startTime, 100)){
    const precision = Math.abs(actual - expect).toFixed(2),
          percent = precision / passedTime

    let color = colors.green,
        pass = true

    if(percent > 0.05 && percent <= 0.10){
      color = colors.cyan
    }
    if(percent > 0.10 && percent <= 0.20){
      color = colors.yellow
    }
    if(percent > 0.20 || Number.isNaN(percent)){
      color = colors.red
      pass = false
    }

    console.log(color(`${caseID} - actual: ${actual}, expect: ${expect}, precision: ${precision} | ${percent.toFixed(2)}`))

    return pass    
  }
}

function _case(fn){
  const caseID = _case.caseID || 0
  _case.caseID = caseID + 1
  return async function(t){
    const startTime = Date.now()
    t.time_compare = makeTimeCompare(caseID, startTime)
    return await fn(t)
  }
}

function _caseSync(fn){
  const caseID = _case.caseID || 0
  _case.caseID = caseID + 1
  return function(t){
    const startTime = Date.now()
    t.time_compare = makeTimeCompare(caseID, startTime)
    return fn(t)
  }
}

test('normal animation', _case(async t => {
  const animator = new Animator({x: 10}, [{x: 20, y: 0}, {x: 50, y: 100}], 500)
  t.truthy(t.time_compare(animator.progress, 0, 1))
  t.is(animator.playState, 'idle')
  animator.play()

  t.is(animator.playState, 'running')
  await sleep(100)
  t.truthy(t.time_compare(animator.progress, 0.2, 1))
  t.is(animator.playState, 'running')

  await sleep(300)
  t.truthy(t.time_compare(animator.progress, 0.8, 1))
  t.is(animator.playState, 'running')

  await sleep(200)
  t.truthy(t.time_compare(animator.progress, 1, 1))
  t.is(animator.playState, 'finished')
}))

test('animation delay', _case(async t => {
  const animator = new Animator({x: 10}, [{x: 20, y: 0, c:'red'}, {x: 50, y: 100, c:'green'}], 
        {delay: 200, duration:500, endDelay: 300})

  t.truthy(t.time_compare(animator.progress, 0, 1))
  t.is(animator.playState, 'idle')
  
  animator.play()
  t.is(animator.playState, 'pending')

  await sleep(100)
  t.truthy(t.time_compare(animator.progress, 0, 1))
  t.is(animator.playState, 'pending')

  await sleep(300)
  t.truthy(t.time_compare(animator.progress, 0.4, 1))
  t.is(animator.playState, 'running')

  t.truthy(t.time_compare(animator.frame.x, animator.progress * 30 + 20, 30))
  t.is(animator.frame.c, 'red')

  await sleep(400)
  t.truthy(t.time_compare(animator.progress, 1, 1))
  t.is(animator.playState, 'pending')

  await sleep(400)
  t.truthy(t.time_compare(animator.progress, 1, 1))
  t.is(animator.playState, 'finished')  
  t.is(animator.frame.c, undefined)
}))

test('animation ready', _case(async t => {
  const animator = new Animator({x: 10}, [{x: 20, y: 0, c:'red'}, {x: 50, y: 100, c:'green'}], 
        {delay: 200, duration:500, endDelay: 300})

  t.is(animator.playState, 'idle')

  animator.play()

  await animator.ready

  t.is(animator.playState, 'running')

  await sleep(100)

  await animator.ready

  t.truthy(t.time_compare(animator.progress, 0.2, 1))
  animator.pause()

  setTimeout(() => {
    animator.play()
  }, 100)

  await animator.ready
  t.is(animator.playState, 'running')

  t.truthy(t.time_compare(animator.progress, 0.2, 1))
}))

test('animation finished', _case(async t => {
  const animator = new Animator({x: 10}, [{x: 20, y: 0, c:'red'}, {x: 50, y: 100, c:'green'}], 
        {delay: 200, duration:500, endDelay: 300})

  t.is(animator.playState, 'idle')
  animator.play()

  await animator.finished
  t.is(animator.playState, 'finished')
  t.truthy(t.time_compare(animator.timeline.currentTime, 800))

  await animator.finished
  t.is(animator.playState, 'finished')

  animator.cancel()
  t.is(animator.playState, 'idle')
  animator.play()
  t.is(animator.playState, 'pending')

  let now = Date.now()
  setTimeout(() => {
    animator.finish()
  }, 100)
  await animator.finished
  t.is(animator.playState, 'finished')
  t.truthy(t.time_compare(Date.now() - now, 100))
}))

