import {nowtime} from './utils'

const defaultOptions = {
  originTime: 0,
  playbackRate: 1.0
}

const _timeMark = Symbol('timeMark'),
      _playbackRate = Symbol('playbackRate'),
      _timers = Symbol('timers'),
      _originTime = Symbol('originTime'),
      _timerID = Symbol('timerID')

export default class Timeline {
  constructor(options){
    options = Object.assign({}, defaultOptions, options)
    
    // timeMark，记录时间线上的参考点，每次 playbackRate 或者 currentTime 写入改变
    // 都会生成一个新的 timeMark
    // timeMark 按照 entropy 顺序排序
    // 如果重置 entropy，会清除该 entropy 之后的所有 timeMark
    // currentTime 根据 timeMark 计算出来
    this[_timeMark] = [{
      globalTime: nowtime(),
      localTime: -options.originTime,
      entropy: -options.originTime,
      playbackRate: options.playbackRate,
    }]

    this[_originTime] = options.originTime
    this[_playbackRate] = options.playbackRate
    this[_timers] = new Map()
    this[_timerID] = 0
  }
  get playbackRate(){
    return this[_playbackRate]
  }
  // 在时间轴世界线中持续流逝的时间
  // 不论 playbackRate 是正还是负，累加
  // 改变 currentTime 不改变 entropy
  // 改变 playbackRate 则影响 entropy 流逝
  // entropy 的初始值受 originTime 的影响
  get entropy(){
    const {globalTime, entropy} = this[_timeMark][this[_timeMark].length - 1]
    return entropy + Math.abs((nowtime() - globalTime) * this.playbackRate)
  }
  // 设置 durtion，不会改变 currentTime
  // 当前设置的 entropy 之后的所有的 mark 都被丢弃
  set entropy(entropy){
    const idx = this.seekTimeMark(entropy)
    this[_timeMark].length = idx + 1
    this[_timeMark].push({
      globalTime: nowtime(),
      localTime: this.currentTime,
      entropy: entropy,
      playbackRate: this.playbackRate,
    })
  }
  seekTime(time){
    const idx = this.seekTimeMark(time),
          timeMark = this[_timeMark][idx]

    const {localTime, entropy, playbackRate} = timeMark

    if(playbackRate > 0){
      return localTime + (time - entropy)    
    } else {
      return localTime - (time - entropy)
    }
  }
  seekTimeMark(entropy){
    const timeMark = this[_timeMark]

    let l = 0, r = timeMark.length - 1

    if(entropy <= timeMark[l].entropy){
      //如果在第一个 timeMark 之前，只能依据第一个 timeMark
      return  l
    }
    if(entropy >= timeMark[r].entropy){
      //如果在最后一个 timeMark 之后，则依据最后一个 timeMark
      return r
    }

    let m = Math.floor((l + r) / 2) //二分查找

    while(m > l && m < r){
      if(entropy == timeMark[m].entropy){
        return m
      } else if(entropy < timeMark[m].entropy){
        r = m
      } else if(entropy > timeMark[m].entropy){
        l = m
      }
      m = Math.floor((l + r) / 2)
    }

    return l
  }
  set playbackRate(rate){
    if(rate !== this.playbackRate){
      const currentTime = this.currentTime
      //reset 让 timeMark 更新
      this.currentTime = currentTime
      this[_playbackRate] = rate
      this[_timeMark][this[_timeMark].length - 1].playbackRate = rate

      if(this[_timers].size){
        //如果有定时器，要更新定时器
        for(let [id, timer] of this[_timers].entries()){
          this.clearTimeout(id)

          const entropy = this.entropy,
                time = timer.time - (entropy - timer.entropy),
                handler = timer.handler

          const delay = time / Math.abs(this.playbackRate)
          let timerID = null

          if(isFinite(delay)){
            timerID = setTimeout(() => {
              handler()
              this[_timers].delete(id)
            }, delay)
          }

          this[_timers].set(id, {
            timerID,
            handler,
            time,
            entropy
          })
        }
      }
    }
  }
  get currentTime(){
    const {localTime, globalTime} = this[_timeMark][this[_timeMark].length - 1]
    return localTime + (nowtime() - globalTime) * this.playbackRate
  }
  set currentTime(time){
    this[_timeMark].push({
      globalTime: nowtime(),
      localTime: time,
      entropy: this.entropy,
      playbackRate: this.playbackRate,
    })
  }
  clearTimeout(id){
    const timer = this[_timers].get(id)
    if(timer && timer.timerID != null){
      clearTimeout(timer.timerID)
    }
  }
  setTimeout(handler, time){
    const currentTime = this.currentTime,
          playbackRate = this.playbackRate,
          entropy = this.entropy

    const id = ++this[_timerID]

    const delay = time / Math.abs(this.playbackRate)

    let timerID = null

    if(isFinite(delay)){
      timerID = setTimeout(() => {
        handler()
        this[_timers].delete(id)
      }, delay)
    }

    this[_timers].set(id, {
      timerID,
      handler,
      time,
      entropy
    })

    return id
  }
}
