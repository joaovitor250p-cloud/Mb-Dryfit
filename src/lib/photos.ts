/** Uma única miniatura por modelo. Fotos originais não são armazenadas no cadastro do catálogo. */
export const PHOTO_MAX_CHARS = 90000;

async function readJpegOrientation(file: File): Promise<number> {
  if (!/jpe?g/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return 1;
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return 1;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) { offset += 1; continue; }
    while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset += 1;
    if (offset >= view.byteLength) break;
    const marker = view.getUint8(offset);
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > view.byteLength) break;
    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > view.byteLength) break;

    const payload = offset + 2;
    const isExif = marker === 0xe1
      && payload + 14 <= view.byteLength
      && view.getUint8(payload) === 0x45
      && view.getUint8(payload + 1) === 0x78
      && view.getUint8(payload + 2) === 0x69
      && view.getUint8(payload + 3) === 0x66
      && view.getUint8(payload + 4) === 0
      && view.getUint8(payload + 5) === 0;

    if (isExif) {
      const tiff = payload + 6;
      const byteOrder = view.getUint16(tiff, false);
      const little = byteOrder === 0x4949;
      if (!little && byteOrder !== 0x4d4d) return 1;
      if (view.getUint16(tiff + 2, little) !== 42) return 1;
      const ifdOffset = view.getUint32(tiff + 4, little);
      const ifd = tiff + ifdOffset;
      if (ifd + 2 > view.byteLength) return 1;
      const entries = view.getUint16(ifd, little);
      for (let index = 0; index < entries; index += 1) {
        const entry = ifd + 2 + index * 12;
        if (entry + 12 > view.byteLength) break;
        if (view.getUint16(entry, little) !== 0x0112) continue;
        const type = view.getUint16(entry + 2, little);
        const count = view.getUint32(entry + 4, little);
        if (type !== 3 || count < 1) return 1;
        const orientation = view.getUint16(entry + 8, little);
        return orientation >= 1 && orientation <= 8 ? orientation : 1;
      }
    }
    offset += segmentLength;
  }
  return 1;
}

const ORIENTATION_TRANSFORMS: Record<number, [number, number, number, number, number, number]> = {
  1: [1, 0, 0, 1, 0, 0],
  2: [-1, 0, 0, 1, 0, 0],
  3: [-1, 0, 0, -1, 0, 0],
  4: [1, 0, 0, -1, 0, 0],
  5: [0, 1, 1, 0, 0, 0],
  6: [0, 1, -1, 0, 0, 0],
  7: [0, -1, -1, 0, 0, 0],
  8: [0, -1, 1, 0, 0, 0],
};

/**
 * Corrige a orientação EXIF antes de compactar. Isso impede que fotos tiradas
 * em celulares Android/iPhone sejam gravadas de lado em outros navegadores.
 */
export async function optimizePhoto(
  file: File,
  maxLength = PHOTO_MAX_CHARS,
  maxDimension = 680,
): Promise<string> {
  if (!file.type.startsWith('image/')) throw Error('Selecione uma foto JPG, PNG ou WebP.');
  if (file.size > 12 * 1024 * 1024) throw Error('Escolha uma foto com até 12 MB.');

  let orientation = 1;
  let bitmap: ImageBitmap;
  try {
    orientation = await readJpegOrientation(file);
    // "none" entrega os pixels sem aplicar EXIF; a rotação é feita uma única vez no canvas.
    bitmap = await createImageBitmap(file, { imageOrientation: 'none' });
  } catch {
    // Navegadores sem suporte à opção decodificam com a orientação do arquivo.
    orientation = 1;
    bitmap = await createImageBitmap(file);
  }

  try {
    const swapsDimensions = orientation >= 5 && orientation <= 8;
    const orientedWidth = swapsDimensions ? bitmap.height : bitmap.width;
    const orientedHeight = swapsDimensions ? bitmap.width : bitmap.height;
    const [a, b, c, d, e, f] = ORIENTATION_TRANSFORMS[orientation] || ORIENTATION_TRANSFORMS[1];

    for (const maxSide of [maxDimension, Math.round(maxDimension * 0.82), Math.round(maxDimension * 0.65), Math.round(maxDimension * 0.5), Math.round(maxDimension * 0.38)]) {
      const ratio = Math.min(1, maxSide / Math.max(orientedWidth, orientedHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(orientedWidth * ratio));
      canvas.height = Math.max(1, Math.round(orientedHeight * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('Não foi possível processar a imagem.');

      // Translações para espelhamentos/rotações EXIF 2–8.
      let finalE = e;
      let finalF = f;
      if (orientation === 2) finalE = bitmap.width;
      if (orientation === 3) { finalE = bitmap.width; finalF = bitmap.height; }
      if (orientation === 4) finalF = bitmap.height;
      if (orientation === 6) finalE = bitmap.height;
      if (orientation === 7) { finalE = bitmap.height; finalF = bitmap.width; }
      if (orientation === 8) finalF = bitmap.width;

      ctx.setTransform(a * ratio, b * ratio, c * ratio, d * ratio, finalE * ratio, finalF * ratio);
      ctx.drawImage(bitmap, 0, 0);
      for (const quality of [0.76, 0.62, 0.48, 0.35]) {
        const webp = canvas.toDataURL('image/webp', quality);
        const encoded = webp.startsWith('data:image/webp;') ? webp : canvas.toDataURL('image/jpeg', quality);
        if (encoded.length <= maxLength) return encoded;
      }
    }
    throw Error('A imagem ficou grande demais. Tente outra foto.');
  } finally {
    bitmap.close();
  }
}
