import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pageItems } from '../src/lib/pagination';
import { formatTanggal, formatTanggalPendek } from '../src/lib/format';

describe('pageItems (ellipsis pagination)', () => {
  it('total <= 7 menampilkan semua nomor tanpa ellipsis', () => {
    assert.deepEqual(pageItems(1, 1), [1]);
    assert.deepEqual(pageItems(3, 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(pageItems(7, 7), [1, 2, 3, 4, 5, 6, 7]);
  });

  it('halaman awal: jendela 1-5 + ellipsis akhir', () => {
    assert.deepEqual(pageItems(1, 20), [1, 2, 3, 4, 5, 'ellipsis-end', 20]);
    assert.deepEqual(pageItems(4, 20), [1, 2, 3, 4, 5, 'ellipsis-end', 20]);
  });

  it('halaman akhir: ellipsis awal + jendela 5 terakhir', () => {
    assert.deepEqual(pageItems(20, 20), [1, 'ellipsis-start', 16, 17, 18, 19, 20]);
    assert.deepEqual(pageItems(17, 20), [1, 'ellipsis-start', 16, 17, 18, 19, 20]);
  });

  it('halaman tengah: ellipsis dua sisi + jendela 3', () => {
    assert.deepEqual(pageItems(10, 20), [1, 'ellipsis-start', 9, 10, 11, 'ellipsis-end', 20]);
  });

  it('selalu tepat 7 slot untuk total besar', () => {
    for (const page of [1, 2, 5, 10, 18, 50, 99, 100]) {
      assert.equal(pageItems(page, 100).length, 7);
    }
  });
});

describe('formatTanggal', () => {
  it('ISO valid diformat gaya Indonesia', () => {
    const out = formatTanggal('2026-10-11T09:40:48.680Z');
    assert.match(out, /Okt 2026/);
    // Ada jam (format id-ID memakai titik: 09.40 atau 16.40 tergantung zona).
    assert.match(out, /\d{2}\.\d{2}/);
  });

  it('ISO tak valid mengembalikan "-"' , () => {
    assert.equal(formatTanggal('bukan-tanggal'), '-');
    assert.equal(formatTanggal(''), '-');
  });

  it('formatTanggalPendek tanpa jam', () => {
    const out = formatTanggalPendek('2026-10-11T09:40:48.680Z');
    assert.match(out, /Okt 2026/);
    assert.doesNotMatch(out, /\d{2}\.\d{2}/);
    assert.equal(formatTanggalPendek('rusak'), '-');
  });
});
