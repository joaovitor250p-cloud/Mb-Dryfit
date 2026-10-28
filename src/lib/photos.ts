/** Uma única miniatura por modelo. Fotos originais não são armazenadas no Firestore. */
export const PHOTO_MAX_CHARS = 90000;
export async function optimizePhoto(file: File, maxLength = PHOTO_MAX_CHARS): Promise<string> {
  if (!file.type.startsWith('image/')) throw Error('Selecione uma foto JPG, PNG ou WebP.');
  if (file.size > 12 * 1024 * 1024) throw Error('Escolha uma foto com até 12 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    for (const maxSide of [680, 560, 440, 340, 260]) {
      const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('Não foi possível processar a imagem.');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.75,0.6,0.48,0.35]) {
        const webp = canvas.toDataURL('image/webp', quality);
        const encoded = webp.startsWith('data:image/webp;') ? webp : canvas.toDataURL('image/jpeg', quality);
        if (encoded.length <= maxLength) return encoded;
      }
    }
    throw Error('A imagem ficou grande demais. Tente outra foto.');
  } finally { bitmap.close(); }
}
