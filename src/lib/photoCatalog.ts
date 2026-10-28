import raw from './photoCatalogSeed.json';
import { normalizeReference, normalizeText } from './catalog';

// Fotos públicas dos produtos da MB DRYFIT: apenas fallback de apresentação.
// NÃO são gravadas no Firestore e nunca substituem fotos escolhidas manualmente.
// A interface só recebe as fotos depois da autenticação e da leitura dos modelos.
const canonicalName = (value: string) => normalizeText(value).replace(/[.,;:()\-_/]/g, ' ').replace(/\s+/g, ' ').trim();
const canonicalRef = (value: string) => normalizeReference(value);
const photos = new Map<string,string>(raw.map(({ name, reference, imageUrl }) => [
  `${canonicalName(name)}\u0000${canonicalRef(reference)}`, imageUrl
]));
export const publicCatalogPhoto = (name: string, reference: string): string =>
  photos.get(`${canonicalName(name)}\u0000${canonicalRef(reference)}`) || '';
export const publicCatalogPhotoCount = photos.size;
