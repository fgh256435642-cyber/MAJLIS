import { useCallback, useEffect, useState } from 'react';

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStoredJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or private mode errors
  }
}

export function usePersistentBool(
  storageKey: string,
  defaultValue: boolean
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState<boolean>(() => {
    const parsed = readStoredJson<unknown>(storageKey, defaultValue);
    return typeof parsed === 'boolean' ? parsed : defaultValue;
  });

  useEffect(() => {
    const parsed = readStoredJson<unknown>(storageKey, defaultValue);
    setValue(typeof parsed === 'boolean' ? parsed : defaultValue);
  }, [storageKey, defaultValue]);

  const setPersistentValue = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        writeStoredJson(storageKey, resolved);
        return resolved;
      });
    },
    [storageKey]
  );

  return [value, setPersistentValue];
}

export function usePersistentCollapseMap(storageKey: string) {
  const [map, setMap] = useState<Record<string, boolean>>(() =>
    readStoredJson<Record<string, boolean>>(storageKey, {})
  );

  useEffect(() => {
    setMap(readStoredJson<Record<string, boolean>>(storageKey, {}));
  }, [storageKey]);

  const isCollapsed = useCallback(
    (sectionKey: string, defaultCollapsed = false): boolean => {
      if (sectionKey in map) {
        return Boolean(map[sectionKey]);
      }
      return defaultCollapsed;
    },
    [map]
  );

  const toggleSection = useCallback(
    (sectionKey: string, defaultCollapsed = false) => {
      setMap((prev) => {
        const current =
          sectionKey in prev ? Boolean(prev[sectionKey]) : defaultCollapsed;
        const next = { ...prev, [sectionKey]: !current };
        writeStoredJson(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  return { isCollapsed, toggleSection };
}
