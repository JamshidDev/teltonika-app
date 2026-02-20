// test/test-teltonika.ts
import * as net from 'net';

const client = new net.Socket();

client.connect(5027, '127.0.0.1', () => {
  console.log('Ulandi!');

  // IMEI yuborish
  const imei = '352093089612345';
  const imeiBuf = Buffer.alloc(2 + imei.length);
  imeiBuf.writeUInt16BE(imei.length, 0);
  imeiBuf.write(imei, 2, 'ascii');
  client.write(imeiBuf);
});

client.on('data', (data) => {
  // IMEI tasdiqlandi
  if (data.length === 1 && data[0] === 0x01) {
    console.log('IMEI tasdiqlandi ✅');
    client.write(buildPacket());
    return;
  }

  // ACK
  if (data.length === 4) {
    console.log(`Server ${data.readInt32BE(0)} ta record qabul qildi ✅`);
    client.destroy();
  }
});

function buildPacket(): Buffer {
  const buf = Buffer.alloc(80);
  let offset = 0;

  buf.writeUInt32BE(0x00000000, offset);
  offset += 4; // preamble
  buf.writeUInt32BE(0x00000030, offset);
  offset += 4; // data length
  buf.writeUInt8(0x08, offset);
  offset += 1; // codec 8
  buf.writeUInt8(0x01, offset);
  offset += 1; // 1 record

  // Timestamp
  buf.writeBigInt64BE(BigInt(Date.now()), offset);
  offset += 8;
  buf.writeUInt8(0x01, offset);
  offset += 1; // priority

  // Toshkent GPS
  buf.writeInt32BE(Math.round(69.2401 * 1e7), offset);
  offset += 4;
  buf.writeInt32BE(Math.round(41.2995 * 1e7), offset);
  offset += 4;
  buf.writeInt16BE(450, offset);
  offset += 2;
  buf.writeUInt16BE(90, offset);
  offset += 2;
  buf.writeUInt8(12, offset);
  offset += 1;
  buf.writeUInt16BE(60, offset);
  offset += 2;

  // I/O bo'sh
  buf.writeUInt8(0, offset);
  offset += 1;
  buf.writeUInt8(0, offset);
  offset += 1;
  buf.writeUInt8(0, offset);
  offset += 1;
  buf.writeUInt8(0, offset);
  offset += 1;
  buf.writeUInt8(0, offset);
  offset += 1;
  buf.writeUInt8(0, offset);
  offset += 1;

  buf.writeUInt8(0x01, offset);
  offset += 1; // records count
  buf.writeUInt32BE(0x00000000, offset);
  offset += 4; // CRC

  return buf.subarray(0, offset);
}
