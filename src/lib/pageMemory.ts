import { useEffect, useRef } from 'react';

type StoredPageState = Record<string, unknown> & { scrollY?: number };

export function readPageMemory<T extends Record<string, unknown>>(key: string, fallback: T): T & { scrollY: number } {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) as StoredPageState : {};
    return { ...fallback, ...parsed, scrollY: Number(parsed.scrollY || 0) } as T & { scrollY: number };
  } catch {
    return { ...fallback, scrollY: 0 } as T & { scrollY: number };
  }
}

export function usePageMemory(key: string, state: Record<string, unknown>, ready = true): void {
  const stateRef = useRef(state);
  stateRef.current = state;
  const serializedState = JSON.stringify(state);
  const restoredKeyRef = useRef('');

  useEffect(() => {
    if (!ready || restoredKeyRef.current === key) return;
    restoredKeyRef.current = key;
    const saved = readPageMemory(key, {});
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => window.scrollTo(0, saved.scrollY));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [key, ready]);

  useEffect(() => {
    const writeState = (includeScroll: boolean) => {
      try {
        const previous = readPageMemory(key, {});
        const next = { ...previous, ...stateRef.current };
        if (includeScroll) next.scrollY = window.scrollY;
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // A navegação continua funcionando mesmo se o armazenamento da sessão estiver indisponível.
      }
    };

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        writeState(true);
      });
    };
    const onPageHide = () => writeState(true);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', onPageHide);
    writeState(false);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onPageHide);
      if (frame) cancelAnimationFrame(frame);
      writeState(true);
    };
  }, [key]);

  useEffect(() => {
    try {
      const previous = readPageMemory(key, {});
      sessionStorage.setItem(key, JSON.stringify({ ...previous, ...JSON.parse(serializedState) }));
    } catch {
      // Não interrompe a tela se sessionStorage estiver bloqueado.
    }
  }, [key, serializedState]);
}
