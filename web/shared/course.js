export const STAGES = Object.freeze([{name:'04 / PINE NEEDLE',seed:404,blocks:7},{name:'05 / SWITCHBACK',seed:505,blocks:8},{name:'06 / RIDGELINE',seed:606,blocks:8},{name:'07 / SERPENT',seed:707,blocks:9},{name:'08 / LONG WAY HOME',seed:808,blocks:10},{name:'09 / RIGHT RIGHT RIGHT',seed:909,blocks:10}]);
/** Browser port of src/CourseGeometry.cs, using the same xorshift seed and turns. */
export class Rng {
  constructor(seed) { this.state = seed >>> 0 || 0x9e3779b9; }
  next() { let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return this.state = x >>> 0; }
  range(lo, hi) { return lo + this.next() / 0xffffffff * (hi - lo); }
  int(lo, hi) { return lo + this.next() % (hi - lo); }
}
export function direction(points, i) {
  const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
  const n = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.x - a.x) / n, z: (b.z - a.z) / n };
}
export function nearestPoint(course, x, z, hint = -1, radius = 150) {
  let best = Infinity, index = 0, t = 0, px = 0, pz = 0;
  const points = course.points;
  const lo = hint >= 0 ? Math.max(0, hint - radius) : 0;
  const hi = hint >= 0 ? Math.min(points.length - 1, hint + radius) : points.length - 1;
  for (let i = lo; i < hi; i++) {
    const a = points[i], b = points[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const q = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const nx = a.x + dx * q, nz = a.z + dz * q, ds = (x - nx) ** 2 + (z - nz) ** 2;
    if (ds < best) { best = ds; index = i; t = q; px = nx; pz = nz; }
  }
  const a = points[index], b = points[index + 1] || a;
  return { index, t, x: px, z: pz, y: a.y + (b.y - a.y) * t, distance: Math.sqrt(best), direction: direction(points, index) };
}
export function generateCourse(seed = 84183, mode = 'coop', blocks = 4, profile = 0) {
  blocks = Math.max(4, Math.min(12, blocks | 0));
  const rng = new Rng((seed ^ Math.imul(profile, 16777619)) | 0), points = [{ x: 0, y: 20, z: 0 }];
  let position = points[0], heading = 0, hairpins = 0, hardCorners = 0;
  function add(x,z) { position = { x, y:20, z }; points.push(position); }
  function straight(length) { const start = position, n = Math.ceil(length / 1.25), dx = Math.sin(heading), dz = Math.cos(heading); for (let i = 1; i <= n; i++) add(start.x + dx * length * i / n, start.z + dz * length * i / n); }
  function turn(degrees, radius) {
    const angle = degrees * Math.PI / 180, sign = Math.sign(angle), h0 = heading;
    const cx = position.x + Math.cos(heading) * radius * sign, cz = position.z - Math.sin(heading) * radius * sign;
    const n = Math.ceil(Math.abs(angle) * radius / .9);
    for (let i=1;i<=n;i++) { const h = h0 + angle * i/n; add(cx-Math.cos(h)*radius*sign,cz+Math.sin(h)*radius*sign); }
    heading=h0+angle;
  }
  straight(65);
  for(let block=0;block<blocks;block++) {
    const sign=rng.int(0,2)===0?-1:1, type=block%3===0?0:rng.int(0,3);
    straight(rng.range(28,55));
    if(type===0) {
      const r=rng.range(9,13),span=rng.range(75,120),back=rng.range(40,62);
      turn(sign*90,12);straight(span);turn(sign*180,r);straight(back);turn(-sign*180,r);straight(back+r*2+rng.range(30,55));turn(-sign*90,12);straight(65);hairpins+=2;hardCorners+=2;
    } else if(type===1) {
      const span=rng.range(35,75),r=rng.range(10,15);
      turn(sign*90,r);straight(span);turn(-sign*90,r);straight(rng.range(35,60));turn(-sign*90,r);straight(span);turn(sign*90,r);straight(35);hardCorners+=4;
    } else {
      const angle=rng.range(65,85),span=rng.range(30,50);
      turn(sign*angle,12);straight(span);turn(-sign*angle*2,10);straight(span);turn(sign*angle,12);straight(50);hardCorners+=3;
    }
  }
  straight(65);
  let nativeDistance=0,length=0;
  for(let i=1;i<points.length;i++) {
    nativeDistance+=Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z);
    points[i].y=20+Math.max(0,Math.min(1,(nativeDistance-65)/80))*Math.sin(nativeDistance*.006)*3;
  }
  for(const p of points) { p.x*=1.7;p.z*=1.7; }
  const distances=[0];
  for(let i=1;i<points.length;i++) {length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y,points[i].z-points[i-1].z);distances.push(length);}
  // Original single-car road is 5 m. Only the two-car race needs extra width.
  const course={seed:seed|0,mode,profile,blocks,points,width:mode==='race'?9.5:5,length,distances,hairpins,hardCorners,trees:[],mud:[]};
  const treeRng=new Rng(seed^0x74726565);
  let nextTree=0,nextBack=0;
  for(let i=1;i<points.length;i++) {
    if(distances[i]>=nextTree) {
      for(const side of [-1,1]) {
        const p=points[i],d=direction(points,i),offset=course.width*.5+1.8;
        course.trees.push({x:p.x+d.z*offset*side,y:p.y-.2,z:p.z-d.x*offset*side,yaw:treeRng.range(0,Math.PI*2),scale:treeRng.range(.83,1.2),radius:.32,variant:treeRng.int(0,6),solid:true});
      }
      nextTree=distances[i]+.8;
    }
    if(distances[i]>=nextBack) {
      for(const side of [-1,1]) for(let row=0;row<3;row++) {
        const p=points[i],d=direction(points,i),offset=treeRng.range(10+row*9,18+row*9);
        const x=p.x+d.z*offset*side+d.x*treeRng.range(-2,2),z=p.z-d.x*offset*side+d.z*treeRng.range(-2,2);
        if(nearestPoint(course,x,z).distance<course.width*.5+1.4) continue;
        course.trees.push({x,y:p.y-.3,z,yaw:treeRng.range(0,Math.PI*2),scale:treeRng.range(.8,1.4),radius:.32,variant:treeRng.int(0,6),solid:true});
      }
      nextBack=distances[i]+6;
    }
  }
  for(const [index,sign] of [[0,-1],[points.length-1,1]]) {
    const p=points[index],d=direction(points,index);
    for(let side=-6;side<=6;side+=.8) course.trees.push({x:p.x+d.x*sign*2+d.z*side,y:p.y-.2,z:p.z+d.z*sign*2-d.x*side,yaw:treeRng.range(0,Math.PI*2),scale:1,radius:.32,variant:treeRng.int(0,6),solid:true});
  }
  for(const tree of course.trees)tree.radius*=tree.scale;
  const mudRng=new Rng(seed^0x564725);let nextMud=mudRng.range(110,160);
  for(let i=1;i<points.length-35;i++) if(distances[i]>=nextMud) { const p=points[i];course.mud.push({...p,index:i,amount:mudRng.range(.4,.65)});nextMud+=mudRng.range(135,220); }
  return course;
}
