export function nowtime(){
  if(typeof performance !== 'undefined' && performance.now){
    return performance.now();
  }
  return Date.now ? Date.now() : (new Date()).getTime();
}
