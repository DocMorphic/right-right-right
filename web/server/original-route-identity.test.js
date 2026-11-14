import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DEFAULT_STAGE,STAGES,generateCourse} from '../shared/course.js';

// Baseline independently re-exported from the installed original on2026-11-14
// and compared with the actual Vercel bundle, not just server/client agreement.
const originals=[
  ['1','c7e6b5a67c3af64564dd79bb87795c1f4bc8dd5ecaa43cde71430b8e82acfef4','cbb87e0d7eb033a5d61b6671644ecdfb0c9d983dfe440ff2b7a6223aec3de78e'],
  ['2','5d71b272375fa0ffd624740bacd948d9509c40a9d3fea39d4f51aad24611135a','ce8e5e3792d6fb879288f293fbf429e25aaf198f5d98ed20e3948dfc0e928b03'],
  ['3','3bc2af506ee0124f8385e62021e17956cf60f7c4ec470bffb1421d0d08e2e89c','0864f0f5e52d558dca28c6c649ff6c3be24e0ac2122f19de2693ab3601763539']
];
function layoutHash(course){
  const data={points:course.points.map(p=>[p.x,p.y,p.z].map(n=>Math.round(n*1e5))),roadPositions:course.roadMesh.positions.map(n=>Math.round(n*1e5)),roadIndices:course.roadMesh.indices,startPose:course.startPose,finishPose:course.finishPose};
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
for(const [scene,sourceHash,expectedLayout] of originals)test(`original Stage0${scene} keeps its verified road and start/finish across seeds and modes`,()=>{
  const stage=STAGES.find(s=>s.nativeScene===scene);assert.ok(stage);assert.ok(stage.name.startsWith(`0${scene} /`));
  for(const seed of [1,12345,2147483647])for(const mode of ['coop','race']){
    const course=generateCourse(seed,mode,stage.blocks,stage.seed);
    assert.equal(course.source.sha256,sourceHash,'an updated original build requires a fresh route comparison');
    assert.equal(layoutHash(course),expectedLayout,'original stages must not be replaced, regenerated, reversed or rescaled');
  }
});
test('the first original route is selected by default rather than the first procedural protocol index',()=>{
  assert.equal(STAGES[DEFAULT_STAGE].nativeScene,'1');assert.notEqual(DEFAULT_STAGE,STAGES.findIndex(s=>s.name.startsWith('04 /')));
});
