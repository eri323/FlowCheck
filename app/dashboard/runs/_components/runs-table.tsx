"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { Filter, Search } from "@/components/ui/icons";
import { TEST_TYPES, TEST_TYPE_LABELS } from "@/lib/validation/test-run";
import { RunListHeader, RunRow, type RunListItem } from "./run-list";

const STATUS_TABS: TabItem[] = [
  { id: "todos", label: "Todos" },
  { id: "completado", label: "Completados" },
  { id: "fallido", label: "Fallidos" },
  { id: "activo", label: "En curso" },
];

export function RunsTable({
  runs,
}: {
  runs: RunListItem[];
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("todos");
  const [type, setType] = useState("todos");

  const statusTabs = useMemo<TabItem[]>(
    () =>
      STATUS_TABS.map((tab) => {
        let count: number;
        if (tab.id === "todos") {
          count = runs.length;
        } else if (tab.id === "activo") {
          count = runs.filter(
            (r) => r.status === "pendiente" || r.status === "corriendo",
          ).length;
        } else {
          count = runs.filter((r) => r.status === tab.id).length;
        }
        return { ...tab, count };
      }),
    [runs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return runs.filter((run) => {
      if (status === "activo") {
        if (run.status !== "pendiente" && run.status !== "corriendo")
          return false;
      } else if (status !== "todos") {
        if (run.status !== status) return false;
      }
      if (type !== "todos" && run.test_type !== type) return false;
      if (q) {
        const haystack = `${run.target_url} ${run.prompt ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [runs, query, status, type]);

  const hasFilters =
    query.trim() !== "" || status !== "todos" || type !== "todos";

  function clear(): void {
    setQuery("");
    setStatus("todos");
    setType("todos");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <Tabs
            items={statusTabs}
            value={status}
            onValueChange={setStatus}
          />
          <div className="flex gap-2.5 sm:ml-auto">
            <Select
              value={type}
              onChange={(e) => setType(e.target.value)}
              aria-label="Filtrar por tipo"
              className="sm:w-40"
            >
              <option value="todos">Todos los tipos</option>
              {TEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TEST_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="relative sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por URL o instrucción"
            aria-label="Buscar test runs"
            className="pl-9"
          />
        </div>
      </div>

      <div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <RunListHeader />
          {filtered.length > 0 ? (
            <div className="divide-y divide-border">
              {filtered.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Filter}
              title="Sin coincidencias"
              description="Ningún run cumple los filtros activos. Ajusta la búsqueda o límpialos."
              action={
                <Button variant="secondary" size="sm" onClick={clear}>
                  Limpiar filtros
                </Button>
              }
            />
          )}
        </div>
        <p className="mt-2.5 px-1 text-xs text-faint">
          {filtered.length} {filtered.length === 1 ? "run" : "runs"}
          {hasFilters ? ` de ${runs.length}` : ""}
        </p>
      </div>
    </div>
  );
}
