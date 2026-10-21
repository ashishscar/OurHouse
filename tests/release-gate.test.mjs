import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForRelease} from '../scripts/release-gate.mjs';
import {RELEASE} from '../launch/release.mjs';
test('release verification tolerates a brief prior version but requires the healthy exact release',async()=>{let calls=0;const delays=[];await waitForRelease(async()=>Response.json({ok:true,release:++calls<3?RELEASE-1:RELEASE}),async ms=>delays.push(ms));assert.equal(calls,3);assert.deepEqual(delays,[1000,1000]);});
test('release verification fails closed after bounded attempts for stale or unhealthy production',async()=>{for(const health of [{ok:true,release:RELEASE-1},{ok:false,release:RELEASE}]){let calls=0;await assert.rejects(waitForRelease(async()=>{calls++;return Response.json(health);},async()=>{},3),/Production health\/release check failed/);assert.equal(calls,3);}});
