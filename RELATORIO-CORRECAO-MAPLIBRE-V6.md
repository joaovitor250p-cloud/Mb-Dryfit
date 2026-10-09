# Correção V6 — MapLibre / marcadores

- Removidas expressões dinâmicas de `icon-allow-overlap`, `icon-ignore-placement`, `text-allow-overlap` e `text-ignore-placement`, pois essas propriedades exigem booleanos na versão MapLibre utilizada.
- Mantidos os marcadores verdes e a lógica de parada simples/múltipla.
- Adicionado cache-busting `?v=20261009-v6` em CSS e JS locais para impedir que o celular/PWA reutilize a versão anterior em cache.
