/**
 * Cola en memoria que ejecuta tareas de a una (concurrencia 1). El worker
 * corre en Render free tier con 512 MB de RAM: dos Chromium simultáneos la
 * agotarían, así que los runs se serializan.
 */
type Task = () => Promise<void>;

const pending: Task[] = [];
let draining = false;

export function enqueueExclusive(task: Task): void {
  pending.push(task);
  void drain();
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  while (pending.length > 0) {
    const task = pending.shift()!;
    try {
      await task();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] una tarea de la cola falló: ${message}`);
    }
  }
  draining = false;
}
