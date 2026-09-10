/** Download mutex — serializes runtime/model/update downloads. */
type BusyListener = (busy: boolean) => void;

const listeners = new Set<BusyListener>();
let active: Promise<unknown> = Promise.resolve();
let depth = 0;

function notify(busy: boolean): void {
  for (const cb of listeners) cb(busy);
}

export function onDownloadBusyChange(cb: BusyListener): void {
  listeners.add(cb);
}

export function isDownloadBusy(): boolean {
  return depth > 0;
}

export function withDownloadMutex<T>(task: () => Promise<T>): Promise<T> {
  if (depth === 0) notify(true);
  depth++;
  const next = active.then(task, task);
  active = next.then(
    () => undefined,
    () => undefined,
  );
  void next.finally(() => {
    depth--;
    if (depth === 0) notify(false);
  });
  return next;
}
