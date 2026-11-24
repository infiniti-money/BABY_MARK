import test from 'node:test';import assert from 'node:assert/strict';
import {parseMapsCoords,mapsSearchUrl} from '../public/maps-import.mjs';
test('imports explicit pin coordinates, rejects viewport, short links and ambiguous URLs',()=>{
 const p={lat:20.9,lng:106.1};
 assert.deepEqual(parseMapsCoords('20.9, 106.1'),p);
 assert.deepEqual(parseMapsCoords('https://www.google.com/maps/search/?api=1&query=20.9%2C106.1'),p);
 assert.deepEqual(parseMapsCoords('https://www.google.com/maps/place/Test/@20,105,17z/data=!3d20.9!4d106.1'),p);
 for(const v of ['https://maps.app.goo.gl/example','https://www.google.com/maps/@20.9,106.1,17z','https://example.com/?q=20.9,106.1','91,106','https://www.google.com/maps/data=!3d20!4d106!3d21!4d105'])assert.equal(parseMapsCoords(v),null);
 assert.equal(new URL(mapsSearchUrl('BABY MARK Xuân Quan')).searchParams.get('query'),'BABY MARK Xuân Quan');
});
