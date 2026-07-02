import { useSyncExternalStore } from "react";

type Listener = () => void;

export type Signal<T> = {
  value: T;
};

export type ReadonlySignal<T> = {
  readonly value: T;
};

const listeners = new Set<Listener>();
let version = 0;

function emitChange(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): number {
  return version;
}

export function useSignalSnapshot(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function signal<T>(initialValue: T): Signal<T> {
  let current = initialValue;
  return {
    get value() {
      return current;
    },
    set value(nextValue: T) {
      if (Object.is(current, nextValue)) return;
      current = nextValue;
      emitChange();
    },
  };
}

export function computed<T>(reader: () => T): ReadonlySignal<T> {
  return {
    get value() {
      return reader();
    },
  };
}
