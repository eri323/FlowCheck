"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TEST_TYPES,
  TEST_TYPE_LABELS,
  type TestType,
} from "@/lib/validation/test-run";

type FieldErrors = Record<string, string[] | undefined>;

type ApiResponse = {
  ok: boolean;
  message?: string;
  errors?: FieldErrors;
  testRunId?: string;
};

const TYPE_HINTS: Record<TestType, string> = {
  login: "Probaremos que las credenciales permiten ingresar.",
  registro: "Crearemos una cuenta nueva con estos datos.",
  busqueda: "Usaremos el buscador del sitio.",
  navegacion: "Inferiremos los pasos desde tu instrucción libre.",
  formulario: "Llenaremos un formulario con campos:valor.",
  ecommerce: "Simularemos una compra con tarjeta de prueba.",
};

type LoginState = { email: string; password: string };
type RegistroState = { name: string; email: string; password: string; confirmPassword: string };
type BusquedaState = { query: string; expectedResult: string };
type FormularioState = { fields: string };
type EcommerceState = { email: string; card: string; expiry: string; cvc: string };

export function NewTestRunForm(): React.JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [lastTestRunId, setLastTestRunId] = useState<string | null>(null);

  const [targetUrl, setTargetUrl] = useState("");
  const [extraPrompt, setExtraPrompt] = useState("");
  const [testType, setTestType] = useState<TestType>("login");

  const [login, setLogin] = useState<LoginState>({ email: "", password: "" });
  const [registro, setRegistro] = useState<RegistroState>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [busqueda, setBusqueda] = useState<BusquedaState>({
    query: "",
    expectedResult: "",
  });
  const [formulario, setFormulario] = useState<FormularioState>({ fields: "" });
  const [ecommerce, setEcommerce] = useState<EcommerceState>({
    email: "",
    card: "4242 4242 4242 4242",
    expiry: "",
    cvc: "",
  });

  function buildPayload(): Record<string, unknown> {
    const base = {
      target_url: targetUrl,
      prompt: extraPrompt || undefined,
    };
    switch (testType) {
      case "login":
        return { ...base, test_type: "login", test_data: login };
      case "registro":
        return { ...base, test_type: "registro", test_data: registro };
      case "busqueda":
        return {
          ...base,
          test_type: "busqueda",
          test_data: {
            query: busqueda.query,
            expectedResult: busqueda.expectedResult || undefined,
          },
        };
      case "navegacion":
        return { ...base, test_type: "navegacion", test_data: {} };
      case "formulario":
        return { ...base, test_type: "formulario", test_data: formulario };
      case "ecommerce":
        return { ...base, test_type: "ecommerce", test_data: ecommerce };
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setServerMessage(null);
    setFieldErrors({});

    const payload = buildPayload();

    startTransition(async () => {
      let result: ApiResponse;
      try {
        const response = await fetch("/api/test-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        result = (await response.json()) as ApiResponse;
      } catch {
        setServerMessage("No se pudo conectar con el servidor.");
        return;
      }

      if (!result.ok) {
        setServerMessage(result.message ?? "Error inesperado");
        setFieldErrors(result.errors ?? {});
        return;
      }

      setLastTestRunId(result.testRunId ?? null);
      setServerMessage("Test run creado. El worker lo procesará.");
      router.refresh();
    });
  }

  const fieldError = (key: string): string | undefined => fieldErrors[key]?.[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Field
        label="URL a probar"
        htmlFor="target_url"
        error={fieldError("target_url")}
      >
        <input
          id="target_url"
          name="target_url"
          type="url"
          required
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://miapp.com"
          className={inputClass}
        />
      </Field>

      <div>
        <p className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Tipo de prueba
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TEST_TYPES.map((type) => {
            const isActive = type === testType;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setTestType(type)}
                className={`rounded-lg border px-3 py-3 text-left text-sm font-medium transition ${
                  isActive
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-200"
                    : "border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
                }`}
                aria-pressed={isActive}
              >
                {TEST_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-zinc-500">{TYPE_HINTS[testType]}</p>
      </div>

      {testType === "login" ? (
        <DynamicSection title="Credenciales" secure>
          <Field
            label="Email o usuario"
            htmlFor="login-email"
            error={fieldError("test_data")}
          >
            <input
              id="login-email"
              type="text"
              required
              value={login.email}
              onChange={(e) => setLogin({ ...login, email: e.target.value })}
              placeholder="admin@test.com, usuario o CC"
              className={inputClass}
            />
          </Field>
          <Field label="Contraseña" htmlFor="login-password">
            <input
              id="login-password"
              type="password"
              required
              value={login.password}
              onChange={(e) => setLogin({ ...login, password: e.target.value })}
              placeholder="••••••••"
              className={inputClass}
            />
          </Field>
        </DynamicSection>
      ) : null}

      {testType === "registro" ? (
        <DynamicSection title="Datos de registro" secure>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="reg-name">
              <input
                id="reg-name"
                type="text"
                required
                value={registro.name}
                onChange={(e) => setRegistro({ ...registro, name: e.target.value })}
                placeholder="Juan Pérez"
                className={inputClass}
              />
            </Field>
            <Field label="Email" htmlFor="reg-email">
              <input
                id="reg-email"
                type="email"
                required
                value={registro.email}
                onChange={(e) => setRegistro({ ...registro, email: e.target.value })}
                placeholder="juan@test.com"
                className={inputClass}
              />
            </Field>
            <Field label="Contraseña" htmlFor="reg-password">
              <input
                id="reg-password"
                type="password"
                required
                minLength={8}
                value={registro.password}
                onChange={(e) => setRegistro({ ...registro, password: e.target.value })}
                placeholder="••••••••"
                className={inputClass}
              />
            </Field>
            <Field
              label="Confirmar contraseña"
              htmlFor="reg-confirm"
            >
              <input
                id="reg-confirm"
                type="password"
                required
                value={registro.confirmPassword}
                onChange={(e) =>
                  setRegistro({ ...registro, confirmPassword: e.target.value })
                }
                placeholder="••••••••"
                className={inputClass}
              />
            </Field>
          </div>
        </DynamicSection>
      ) : null}

      {testType === "busqueda" ? (
        <DynamicSection title="Parámetros de búsqueda">
          <Field label="Término a buscar" htmlFor="search-query">
            <input
              id="search-query"
              type="text"
              required
              value={busqueda.query}
              onChange={(e) => setBusqueda({ ...busqueda, query: e.target.value })}
              placeholder="zapatillas nike"
              className={inputClass}
            />
          </Field>
          <Field
            label="Resultado esperado (opcional)"
            htmlFor="search-expected"
          >
            <input
              id="search-expected"
              type="text"
              value={busqueda.expectedResult}
              onChange={(e) =>
                setBusqueda({ ...busqueda, expectedResult: e.target.value })
              }
              placeholder="al menos 1 resultado"
              className={inputClass}
            />
          </Field>
        </DynamicSection>
      ) : null}

      {testType === "navegacion" ? (
        <DynamicSection title="Sin campos extra">
          <p className="text-sm text-zinc-500">
            Claude inferirá los pasos desde la instrucción adicional (si no hay,
            ejecuta un smoke test del home).
          </p>
        </DynamicSection>
      ) : null}

      {testType === "formulario" ? (
        <DynamicSection title="Datos del formulario" secure>
          <Field
            label="Campos y valores (uno por línea, formato 'clave: valor')"
            htmlFor="form-fields"
          >
            <textarea
              id="form-fields"
              required
              rows={4}
              value={formulario.fields}
              onChange={(e) => setFormulario({ fields: e.target.value })}
              placeholder={"nombre: Juan\nemail: juan@test.com\ntelefono: 3001234567"}
              className={`${inputClass} resize-y font-mono text-xs`}
            />
          </Field>
        </DynamicSection>
      ) : null}

      {testType === "ecommerce" ? (
        <DynamicSection title="Datos de compra" secure>
          <Field label="Email del comprador" htmlFor="ec-email">
            <input
              id="ec-email"
              type="email"
              required
              value={ecommerce.email}
              onChange={(e) => setEcommerce({ ...ecommerce, email: e.target.value })}
              placeholder="comprador@test.com"
              className={inputClass}
            />
          </Field>
          <Field label="Tarjeta (test)" htmlFor="ec-card">
            <input
              id="ec-card"
              type="text"
              required
              value={ecommerce.card}
              onChange={(e) => setEcommerce({ ...ecommerce, card: e.target.value })}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Usa la tarjeta de prueba de Stripe: 4242 4242 4242 4242. Nunca uses una tarjeta real.
            </p>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vencimiento (MM/AA)" htmlFor="ec-expiry">
              <input
                id="ec-expiry"
                type="text"
                required
                value={ecommerce.expiry}
                onChange={(e) =>
                  setEcommerce({ ...ecommerce, expiry: e.target.value })
                }
                placeholder="12/28"
                className={inputClass}
              />
            </Field>
            <Field label="CVC" htmlFor="ec-cvc">
              <input
                id="ec-cvc"
                type="text"
                required
                inputMode="numeric"
                value={ecommerce.cvc}
                onChange={(e) =>
                  setEcommerce({ ...ecommerce, cvc: e.target.value })
                }
                placeholder="123"
                className={inputClass}
              />
            </Field>
          </div>
        </DynamicSection>
      ) : null}

      <Field
        label="Instrucción adicional (opcional)"
        htmlFor="extra-prompt"
        error={fieldError("prompt")}
      >
        <textarea
          id="extra-prompt"
          rows={2}
          maxLength={2000}
          value={extraPrompt}
          onChange={(e) => setExtraPrompt(e.target.value)}
          placeholder="Ej: verifica que el dashboard cargue después del login"
          className={`${inputClass} resize-y`}
        />
        <p className="mt-1 text-xs text-zinc-500">
          No incluyas credenciales aquí — ya están en los campos protegidos.
        </p>
      </Field>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Creando..." : "Generar y ejecutar test"}
      </button>

      {serverMessage ? (
        <p
          className={`text-sm ${
            lastTestRunId ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {serverMessage}
          {lastTestRunId ? (
            <Link
              href={`/dashboard/runs/${lastTestRunId}`}
              className="ml-2 font-medium underline"
            >
              Ver detalle
            </Link>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900";

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function DynamicSection({
  title,
  secure,
  children,
}: {
  title: string;
  secure?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {title}
        </h3>
        {secure ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            campos protegidos
          </span>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
