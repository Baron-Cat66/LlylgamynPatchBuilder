'use strict';
// Usage: node verify.cjs "path/to/original Track 01.bin"
// Optional regression: node verify.cjs TRACK REVIEW_TSV NAMES_IPS COMBINED_IPS
// Game data and name presets are deliberately not included.
const fs = require('fs'), assert = require('assert/strict'), crypto = require('crypto');
const L = require('./core.js');
function applyIPS(original, patch) {
  assert.equal(Buffer.from(patch.subarray(0, 5)).toString(), 'PATCH');
  const out = original.slice(); let p = 5;
  while (p + 3 <= patch.length && Buffer.from(patch.subarray(p, p + 3)).toString() !== 'EOF') {
    const offset = (patch[p] << 16) | (patch[p + 1] << 8) | patch[p + 2]; p += 3;
    assert(p + 2 <= patch.length);
    const length = (patch[p] << 8) | patch[p + 1]; p += 2;
    if (length) { assert(p + length <= patch.length); out.set(patch.subarray(p, p + length), offset); p += length; }
    else { assert(p + 3 <= patch.length); const count = (patch[p] << 8) | patch[p + 1]; p += 2; out.fill(patch[p++], offset, offset + count); }
  }
  assert.equal(Buffer.from(patch.subarray(p)).toString(), 'EOF'); return out;
}
(async () => {
  for (const text of ['長剣', 'アイテム+1', 'ｶﾀｶﾅ', '髙﨑', '～―①', 'がらくた']) {
    assert.equal(L.cp932Decode(L.cp932Encode(text)), text);
  }
  for (const text of ['', '😀', 'a\tb', 'a\nb', 'a\0b']) assert.throws(() => L.cp932Encode(text));
  for (let size of [0, 1, 2, 8, 34, 100, 2048, 4096]) {
    for (const data of [crypto.randomBytes(size), Buffer.alloc(size, 65), Buffer.alloc(size)]) {
      assert(L.equal(L.s8bDecompress(L.s8bCompress(data)), data));
    }
  }
  assert.throws(() => L.s8bDecompress(Uint8Array.of(0, 0, 0, 0)));
  assert.throws(() => L.s8bDecompress(Uint8Array.of(1, 83, 56, 66, 0, 0, 0, 1, 0, 0, 0)));
  for (const offset of [0, 123, 0x454f46, 0xffffff]) {
    const a = new Uint8Array(offset + 2), b = a.slice(); b[offset] = 1;
    assert(L.equal(applyIPS(a, L.makeIPS(a, b).bytes), b));
  }
  const a = new Uint8Array(0x1000001), b = a.slice(); b[0x1000000] = 1;
  assert.throws(() => L.makeIPS(a, b));
  const large = new Uint8Array(70000), largeB = new Uint8Array(70000).fill(1);
  assert(L.equal(applyIPS(large, L.makeIPS(large, largeB).bytes), largeB));
  console.log('PASS: CP932, S8B roundtrips and malformed input, IPS limits and EOF sentinel.');
  if (!process.argv[2]) { console.log('Supply the original Track 01 BIN for disc-level checks.'); return; }
  const original = Uint8Array.from(fs.readFileSync(process.argv[2]));
  const state = await L.loadTrack(original, crypto.webcrypto.subtle);
  assert.deepEqual(state.scenarios.map(s => s.rows.length), [101, 130, 104]);
  for (const s of state.scenarios) assert(L.equal(s.table, L.s8bDecompress(L.s8bCompress(s.table))));
  for (let i = 0; i < original.length / 2352; i++) {
    const sector = original.slice(i * 2352, (i + 1) * 2352); L.recomputeSector(sector, 0);
    assert(L.equal(sector, original.subarray(i * 2352, (i + 1) * 2352)), `sector ${i}`);
  }
  assert(L.equal(L.buildModifiedTrack(state).track, original));
  for (const s of state.scenarios) s.rows[1].known = '検証用の剣';
  const modified = L.buildModifiedTrack(state, true), ips = L.makeIPS(original, modified.track);
  assert(L.equal(applyIPS(original, ips.bytes), modified.track));
  for (const spec of L.SCENARIOS) assert.equal(L.parseScenario(modified.track, spec).rows[1].known, '検証用の剣');
  assert.equal(crypto.createHash('sha256').update(state.original).digest('hex'), L.TRACK_SHA256);
  await assert.rejects(L.loadTrack(new Uint8Array(4), crypto.webcrypto.subtle));
  const wrong = original.slice(); wrong[100] ^= 1;
  await assert.rejects(L.loadTrack(wrong, crypto.webcrypto.subtle));
  console.log('PASS: Track hash and rejection, 335 names, all 7,618 EDC/ECC sectors, editing/reparse, IPS apply, immutable original.');
  if (process.argv.length > 3) {
    assert.equal(process.argv.length, 6, 'Supply REVIEW_TSV NAMES_IPS COMBINED_IPS together.');
    const regression = await L.loadTrack(original, crypto.webcrypto.subtle);
    const lines = fs.readFileSync(process.argv[3], 'utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).slice(1);
    assert.equal(lines.length, 335);
    for (const line of lines) {
      const [sn, no, oldUnknown, newUnknown, oldKnown, newKnown] = line.split('\t');
      const row = regression.scenarios[+sn - 1].rows[+no];
      assert.equal(row.unknown, oldUnknown); assert.equal(row.known, oldKnown);
      row.unknown = newUnknown; row.known = newKnown;
    }
    for (const makanito of [false, true]) {
      const result = L.buildModifiedTrack(regression, makanito), generated = L.makeIPS(original, result.track);
      assert(L.equal(generated.bytes, fs.readFileSync(process.argv[makanito ? 5 : 4])));
      assert(L.equal(applyIPS(original, generated.bytes), result.track));
    }
    console.log('PASS: both existing name IPS files match byte-for-byte.');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
