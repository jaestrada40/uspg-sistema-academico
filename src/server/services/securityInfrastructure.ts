import net from 'node:net';

const redisUrl = process.env.REDIS_URL;

const redisIncrWithExpiry = (key: string, windowMs: number) => new Promise<number>((resolve, reject) => {
  if (!redisUrl) return reject(new Error('REDIS_URL no configurada'));
  const target = new URL(redisUrl);
  const socket = net.createConnection({ host: target.hostname, port: Number(target.port || 6379) });
  let response = '';
  const command = (parts: string[]) => `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`;
  socket.setTimeout(1_500);
  const script = "local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return count";
  socket.once('connect', () => socket.write(command(['EVAL', script, '1', key, String(windowMs)])));
  socket.on('data', (chunk) => { response += chunk.toString('utf8'); const match = response.match(/^:(\d+)\r\n/); if (match) { socket.end(); resolve(Number(match[1])); } });
  socket.once('timeout', () => { socket.destroy(); reject(new Error('Redis timeout')); });
  socket.once('error', reject);
});

export const consumeDistributedRateLimit = async (key: string, limit: number, windowMs: number) => {
  const count = await redisIncrWithExpiry(key, windowMs);
  return count <= limit;
};

export const scanWithClamAv = (content: Buffer) => new Promise<boolean>((resolve, reject) => {
  const host = process.env.CLAMAV_HOST;
  if (!host) return reject(new Error('CLAMAV_HOST no configurado'));
  const socket = net.createConnection({ host, port: Number(process.env.CLAMAV_PORT || 3310) });
  let response = '';
  socket.setTimeout(15_000);
  socket.once('connect', () => {
    socket.write('zINSTREAM\0');
    for (let offset = 0; offset < content.length; offset += 64 * 1024) {
      const part = content.subarray(offset, offset + 64 * 1024);
      const size = Buffer.alloc(4); size.writeUInt32BE(part.length);
      socket.write(size); socket.write(part);
    }
    socket.write(Buffer.alloc(4));
  });
  socket.on('data', (chunk) => { response += chunk.toString('utf8'); if (response.includes('\0') || response.includes('\n')) { socket.end(); resolve(/\bOK\b/.test(response)); } });
  socket.once('timeout', () => { socket.destroy(); reject(new Error('ClamAV timeout')); });
  socket.once('error', reject);
});
