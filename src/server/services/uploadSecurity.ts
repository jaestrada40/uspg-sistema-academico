const signatures: Record<string, (buffer: Buffer) => boolean> = {
  'application/pdf': (buffer) => buffer.subarray(0, 5).toString('ascii') === '%PDF-',
  'image/png': (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (buffer) => buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9,
};

export const decodeVerifiedUpload = (dataUrl: unknown, allowedMimeTypes: string[], maxBytes: number) => {
  const match = String(dataUrl || '').match(/^data:([a-z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match || !allowedMimeTypes.includes(match[1])) return null;
  const content = Buffer.from(match[2], 'base64');
  if (!content.length || content.length > maxBytes || !signatures[match[1]]?.(content)) return null;
  return { mimeType: match[1], content, base64: content.toString('base64') };
};

export const secureFileResponse = (res: { setHeader: (name: string, value: string) => void }, mimeType: string, fileName: string) => {
  const safeName = fileName.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'documento';
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
};
