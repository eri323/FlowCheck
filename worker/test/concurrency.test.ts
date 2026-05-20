import { describe, expect, it } from "vitest";
import { enqueueExclusive } from "../concurrency";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("enqueueExclusive", () => {
  it("ejecuta las tareas de a una, sin solaparlas", async () => {
    const events: string[] = [];

    enqueueExclusive(async () => {
      events.push("A:start");
      await wait(20);
      events.push("A:end");
    });
    enqueueExclusive(async () => {
      events.push("B:start");
      await wait(5);
      events.push("B:end");
    });

    await wait(60);
    expect(events).toEqual(["A:start", "A:end", "B:start", "B:end"]);
  });

  it("sigue procesando aunque una tarea lance error", async () => {
    const events: string[] = [];
    enqueueExclusive(async () => {
      throw new Error("boom");
    });
    enqueueExclusive(async () => {
      events.push("ok");
    });
    await wait(30);
    expect(events).toEqual(["ok"]);
  });
});
