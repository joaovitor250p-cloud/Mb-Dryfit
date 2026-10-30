/** Remove nomes técnicos do provedor de mensagens que podem aparecer na interface. */
export function safeProviderMessage(value: unknown, fallback = 'Não foi possível concluir a operação.'): string {
  const raw = value instanceof Error ? value.message : value == null ? fallback : String(value);
  return raw
    .replace(/FirebaseError\s*:?\s*/gi, '')
    .replace(/Firebase/gi, 'serviço de dados')
    .replace(/Firestore/gi, 'banco de dados')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
}
