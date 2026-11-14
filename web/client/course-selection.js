export function freshCourseSeed(previous,random=Math.random) {
  const candidate=1+Math.floor(random()*2147483646);
  return candidate===previous?candidate%2147483647+1:candidate;
}

/** A readiness acknowledgment belongs to one complete course configuration. */
export class CourseSelection {
  constructor({mode,profile,seed}) {
    this.mode=mode;
    this.profile=profile;
    this.seed=seed;
    this.startRequested=false;
  }
  matches(room) {
    return room?.mode===this.mode && room.profile===this.profile && room.seed===this.seed;
  }
  startIfReady(room,localId) {
    if(this.startRequested || room?.status!=='lobby' || room.hostId!==localId || !this.matches(room))return false;
    const required=room.playersRequired || (room.mode==='race'?4:2);
    if(room.seats.length!==required || !room.seats.every(seat=>seat?.ready))return false;
    this.startRequested=true;
    return true;
  }
  retry() { this.startRequested=false; }
  message() { return {type:'configure',mode:this.mode,profile:this.profile,seed:this.seed}; }
}
