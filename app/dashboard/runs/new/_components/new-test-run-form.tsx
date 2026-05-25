"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  TEST_TYPES,
  TEST_TYPE_LABELS,
  type TestType,
} from "@/lib/validation/test-run";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Bolt,
  Cursor,
  Eye,
  Globe,
  Pencil,
  Search,
  Shield,
  Terminal,
} from "@/components/ui/icons";
import { TypeChip } from "@/components/runs/type-chip";

type IconComponent = (props: {
  size?: number;
  className?: string;
}) => React.JSX.Element;

const TYPE_META: Record<
  TestType,
  { icon: IconComponent; hint: string; steps: string; duration: string }
> = {
  login: {
    icon: Shield,
    hint: "Probaremos que las credenciales permiten ingresar.",
    steps: "3–5",
    duration: "15–30 s",
  },
  registro: {
    icon: Pencil,
    hint: "Crearemos una cuenta nueva con estos datos.",
    steps: "6–9",
    duration: "25–45 s",
  },
  busqueda: {
    icon: Search,
    hint: "Usaremos el buscador del sitio.",
    steps: "3–5",
    duration: "15–25 s",
  },
  navegacion: {
    icon: Cursor,
    hint: "Inferiremos los pasos desde tu instrucción libre.",
    steps: "5–10",
    duration: "20–40 s",
  },
  formulario: {
    icon: Terminal,
    hint: "Llenaremos un formulario con campos y valores.",
    steps: "N+1",
    duration: "20–45 s",
  },
  ecommerce: {
    icon: Bolt,
    hint: "Simularemos una compra con tarjeta de prueba.",
    steps: "8–12",
    duration: "30–60 s",
  },
};

type FieldErrors = Record<string, string[] | undefined>;

type ApiResponse = {
  ok: boolean;
  message?: string;
  errors?: FieldErrors;
  testRunId?: string;
};

type LoginState = { email: string; password: string };
type RegistroState = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};
type BusquedaState = { query: string; expectedResult: string };
type FormularioState = { fields: string };
type EcommerceState = {
  email: string;
  card: string;
  expiry: string;
  cvc: string;
};

export function NewTestRunForm(): React.JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [targetUrl, setTargetUrl] = useState("");
  const [extraPrompt, setExtraPrompt] = useState("");
  const [testType, setTestType] = useState<TestType>("login");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

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
      browser: "chromium" as const,
      device,
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
        setServerMessage(result.message ?? "Ocurrió un error inesperado.");
        setFieldErrors(result.errors ?? {});
        return;
      }

      if (result.testRunId) {
        router.push(`/dashboard/runs/${result.testRunId}`);
      } else {
        router.refresh();
      }
    });
  }

  const fieldError = (key: string): string | undefined => fieldErrors[key]?.[0];
  const testDataError = fieldError("test_data");

  const urlHost = useMemo(() => {
    if (!targetUrl) return null;
    try {
      const u = new URL(targetUrl);
      return u.host + (u.pathname !== "/" ? u.pathname : "");
    } catch {
      return null;
    }
  }, [targetUrl]);

  const TypeIcon = TYPE_META[testType].icon;
  const isSecure = SECURE_TYPES.has(testType);

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-5 lg:grid-cols-12"
    >
      {/* ────────────── FORM (left) ────────────── */}
      <Card className="lg:col-span-8">
        <div className="divide-border divide-y">
          {/* 01 — URL + Tipo combinados en una sección densa */}
          <Section
            step="01"
            title="Objetivo"
            description="A dónde apunta y qué clase de flujo es."
          >
            <Field
              label="URL a probar"
              htmlFor="target_url"
              error={fieldError("target_url")}
            >
              <div className="relative">
                <Globe
                  size={15}
                  className="text-faint pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                />
                <Input
                  id="target_url"
                  name="target_url"
                  type="url"
                  required
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://miapp.com"
                  invalid={Boolean(fieldErrors.target_url)}
                  className="pl-9"
                />
              </div>
            </Field>

            <div className="mt-4">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-faint font-mono text-[0.625rem] tracking-widest uppercase">
                  Tipo de prueba
                </span>
                <span className="text-muted text-xs">
                  {TYPE_META[testType].hint}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {TEST_TYPES.map((type) => (
                  <TypeChip
                    key={type}
                    label={TEST_TYPE_LABELS[type]}
                    icon={TYPE_META[type].icon}
                    active={type === testType}
                    onSelect={() => setTestType(type)}
                  />
                ))}
              </div>
            </div>
          </Section>

          {/* 02 — Campos dinámicos según tipo */}
          <Section
            step="02"
            title={DYNAMIC_TITLE[testType]}
            description={DYNAMIC_DESCRIPTION[testType]}
            badge={
              isSecure ? (
                <span className="bg-success-bg text-success-text inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium">
                  <Shield size={11} />
                  cifrados
                </span>
              ) : null
            }
          >
            {testType === "login" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Email o usuario" htmlFor="login-email">
                  <Input
                    id="login-email"
                    type="text"
                    required
                    value={login.email}
                    onChange={(e) =>
                      setLogin({ ...login, email: e.target.value })
                    }
                    placeholder="admin@test.com, usuario o CC"
                  />
                </Field>
                <Field label="Contraseña" htmlFor="login-password">
                  <Input
                    id="login-password"
                    type="password"
                    required
                    value={login.password}
                    onChange={(e) =>
                      setLogin({ ...login, password: e.target.value })
                    }
                    placeholder="••••••••"
                  />
                </Field>
              </div>
            ) : null}

            {testType === "registro" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Nombre" htmlFor="reg-name">
                  <Input
                    id="reg-name"
                    type="text"
                    required
                    value={registro.name}
                    onChange={(e) =>
                      setRegistro({ ...registro, name: e.target.value })
                    }
                    placeholder="Juan Pérez"
                  />
                </Field>
                <Field label="Email" htmlFor="reg-email">
                  <Input
                    id="reg-email"
                    type="email"
                    required
                    value={registro.email}
                    onChange={(e) =>
                      setRegistro({ ...registro, email: e.target.value })
                    }
                    placeholder="juan@test.com"
                  />
                </Field>
                <Field label="Contraseña" htmlFor="reg-password">
                  <Input
                    id="reg-password"
                    type="password"
                    required
                    minLength={8}
                    value={registro.password}
                    onChange={(e) =>
                      setRegistro({ ...registro, password: e.target.value })
                    }
                    placeholder="••••••••"
                  />
                </Field>
                <Field label="Confirmar contraseña" htmlFor="reg-confirm">
                  <Input
                    id="reg-confirm"
                    type="password"
                    required
                    value={registro.confirmPassword}
                    onChange={(e) =>
                      setRegistro({
                        ...registro,
                        confirmPassword: e.target.value,
                      })
                    }
                    placeholder="••••••••"
                  />
                </Field>
              </div>
            ) : null}

            {testType === "busqueda" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Término a buscar" htmlFor="search-query">
                  <Input
                    id="search-query"
                    type="text"
                    required
                    value={busqueda.query}
                    onChange={(e) =>
                      setBusqueda({ ...busqueda, query: e.target.value })
                    }
                    placeholder="zapatillas para correr"
                  />
                </Field>
                <Field
                  label="Resultado esperado"
                  htmlFor="search-expected"
                  hint="Opcional. Por ejemplo: al menos un resultado."
                >
                  <Input
                    id="search-expected"
                    type="text"
                    value={busqueda.expectedResult}
                    onChange={(e) =>
                      setBusqueda({
                        ...busqueda,
                        expectedResult: e.target.value,
                      })
                    }
                    placeholder="al menos 1 resultado"
                  />
                </Field>
              </div>
            ) : null}

            {testType === "navegacion" ? (
              <p className="border-border bg-surface-2 text-muted rounded-md border border-dashed px-3 py-2.5 text-sm">
                Sin campos extra. La IA inferirá los pasos desde tu instrucción
                adicional. Si no la das, ejecuta un smoke test del inicio.
              </p>
            ) : null}

            {testType === "formulario" ? (
              <Field
                label="Campos y valores"
                htmlFor="form-fields"
                hint="Uno por línea, en formato clave: valor."
              >
                <Textarea
                  id="form-fields"
                  required
                  rows={4}
                  value={formulario.fields}
                  onChange={(e) => setFormulario({ fields: e.target.value })}
                  placeholder={
                    "nombre: Juan\nemail: juan@test.com\ntelefono: 3001234567"
                  }
                  className="font-mono text-xs"
                />
              </Field>
            ) : null}

            {testType === "ecommerce" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Email del comprador" htmlFor="ec-email">
                  <Input
                    id="ec-email"
                    type="email"
                    required
                    value={ecommerce.email}
                    onChange={(e) =>
                      setEcommerce({ ...ecommerce, email: e.target.value })
                    }
                    placeholder="comprador@test.com"
                  />
                </Field>
                <Field
                  label="Tarjeta de prueba"
                  htmlFor="ec-card"
                  hint="Stripe test card. Nunca una tarjeta real."
                >
                  <Input
                    id="ec-card"
                    type="text"
                    required
                    value={ecommerce.card}
                    onChange={(e) =>
                      setEcommerce({ ...ecommerce, card: e.target.value })
                    }
                    className="font-mono"
                  />
                </Field>
                <Field label="Vencimiento" htmlFor="ec-expiry">
                  <Input
                    id="ec-expiry"
                    type="text"
                    required
                    value={ecommerce.expiry}
                    onChange={(e) =>
                      setEcommerce({ ...ecommerce, expiry: e.target.value })
                    }
                    placeholder="12/28"
                  />
                </Field>
                <Field label="CVC" htmlFor="ec-cvc">
                  <Input
                    id="ec-cvc"
                    type="text"
                    required
                    inputMode="numeric"
                    value={ecommerce.cvc}
                    onChange={(e) =>
                      setEcommerce({ ...ecommerce, cvc: e.target.value })
                    }
                    placeholder="123"
                  />
                </Field>
              </div>
            ) : null}

            {testDataError ? (
              <p className="text-danger-text mt-3 text-xs">{testDataError}</p>
            ) : null}
          </Section>

          {/* 03 — Instrucción + Runner side-by-side */}
          <Section
            step="03"
            title="Instrucción y runner"
            description="Contexto libre para la IA y opciones de ejecución."
          >
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
              {/* Instrucción */}
              <div className="lg:col-span-3">
                <Field
                  label="Instrucción adicional"
                  htmlFor="extra-prompt"
                  hint="No incluyas credenciales aquí."
                  error={fieldError("prompt")}
                >
                  <Textarea
                    id="extra-prompt"
                    rows={3}
                    maxLength={2000}
                    value={extraPrompt}
                    onChange={(e) => setExtraPrompt(e.target.value)}
                    placeholder="Ej: verifica que el panel carga después del login."
                    invalid={Boolean(fieldErrors.prompt)}
                  />
                </Field>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {PROMPT_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() =>
                        setExtraPrompt((p) => (p ? p + " " : "") + suggestion)
                      }
                      className="border-border bg-surface-2 text-muted hover:border-border-strong hover:text-text inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] transition-colors duration-150"
                    >
                      + {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              {/* Runner */}
              <div className="space-y-3 lg:col-span-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-faint font-mono text-[0.625rem] tracking-widest uppercase">
                    Navegador
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="border-accent-subtle bg-accent-subtle text-accent-text inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs font-medium">
                      Chromium
                    </span>
                    {["Firefox", "WebKit"].map((b) => (
                      <span
                        key={b}
                        title="Próximamente"
                        className="border-border bg-surface-2 text-faint inline-flex cursor-not-allowed items-center rounded-md border px-2.5 py-1.5 text-xs opacity-60"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-faint font-mono text-[0.625rem] tracking-widest uppercase">
                    Dispositivo
                  </span>
                  <div className="border-border bg-surface-2 flex gap-0.5 rounded-md border p-0.5">
                    {(["desktop", "mobile"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDevice(d)}
                        className={
                          device === d
                            ? "bg-elevated text-text shadow-e1 flex-1 rounded px-2 py-1 text-xs font-medium"
                            : "text-muted hover:text-text flex-1 rounded px-2 py-1 text-xs transition-colors"
                        }
                      >
                        {d === "desktop" ? "Desktop" : "Mobile"}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  className="border-border bg-surface-2 flex items-center justify-between rounded-md border px-3 py-2"
                  title="El worker corre en un servidor sin pantalla: siempre headless."
                >
                  <span className="text-muted inline-flex items-center gap-2 text-xs">
                    <Eye size={14} />
                    Modo headless
                  </span>
                  <span className="text-faint inline-flex items-center gap-1.5 text-[0.6875rem]">
                    fijo
                    <span className="bg-accent relative h-3.5 w-6 rounded-full">
                      <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-white" />
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </Section>
        </div>
      </Card>

      {/* ────────────── RESUMEN (right, sticky) ────────────── */}
      <aside className="lg:col-span-4">
        <Card className="overflow-hidden lg:sticky lg:top-6">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="text-faint font-mono text-[0.625rem] tracking-widest uppercase">
                Resumen
              </span>
              <h2 className="text-text text-sm font-semibold">del run</h2>
            </div>
            <span className="text-faint inline-flex items-center gap-1.5 text-[0.6875rem]">
              <span className="relative flex size-1.5">
                <span className="bg-accent absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
                <span className="bg-accent relative inline-flex size-1.5 rounded-full" />
              </span>
              en vivo
            </span>
          </div>

          <dl className="divide-border divide-y text-sm">
            <SummaryRow label="URL">
              {urlHost ? (
                <span className="text-text block max-w-full truncate font-mono text-xs">
                  {urlHost}
                </span>
              ) : (
                <span className="text-faint font-mono text-xs">—</span>
              )}
            </SummaryRow>

            <SummaryRow label="Tipo">
              <span className="text-text inline-flex items-center gap-1.5 text-xs">
                <TypeIcon size={13} className="text-accent-text" />
                {TEST_TYPE_LABELS[testType]}
              </span>
            </SummaryRow>

            <SummaryRow label="Dispositivo">
              <span className="text-text text-xs">
                {device === "desktop" ? "Desktop" : "Mobile"}
                <span className="text-faint ml-1.5">· Chromium</span>
              </span>
            </SummaryRow>

            <SummaryRow label="Pasos est.">
              <span className="text-text font-mono text-xs tabular-nums">
                {TYPE_META[testType].steps}
              </span>
            </SummaryRow>

            <SummaryRow label="Duración est.">
              <span className="text-text font-mono text-xs tabular-nums">
                {TYPE_META[testType].duration}
              </span>
            </SummaryRow>
          </dl>

          {isSecure ? (
            <div className="border-border bg-surface-2 border-t px-4 py-2.5">
              <p className="text-muted flex items-start gap-2 text-[0.6875rem]">
                <Shield
                  size={11}
                  className="text-success-text mt-0.5 shrink-0"
                />
                Las credenciales viajan cifradas y no se persisten en logs.
              </p>
            </div>
          ) : null}

          {serverMessage ? (
            <div className="border-border border-t px-4 py-3">
              <p className="bg-danger-bg text-danger-text flex items-start gap-2 rounded-md px-3 py-2 text-xs">
                <AlertCircle size={13} className="mt-px shrink-0" />
                <span>{serverMessage}</span>
              </p>
            </div>
          ) : null}

          <div className="border-border bg-surface-2 space-y-2 border-t px-4 py-4">
            <Button
              type="submit"
              loading={isPending}
              className="w-full justify-center"
            >
              {isPending ? "Creando" : "Generar y ejecutar"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-disabled="true"
                tabIndex={-1}
                title="Próximamente"
                className="border-border bg-surface text-faint cursor-not-allowed rounded-md border px-2.5 py-1.5 text-[0.6875rem] opacity-60"
              >
                Guardar plantilla
              </button>
              <button
                type="button"
                aria-disabled="true"
                tabIndex={-1}
                title="Próximamente"
                className="border-border bg-surface text-faint cursor-not-allowed rounded-md border px-2.5 py-1.5 text-[0.6875rem] opacity-60"
              >
                Programar
              </button>
            </div>
            <p className="text-faint pt-1 text-[0.6875rem] leading-relaxed">
              La IA generará el plan y el worker lo ejecutará en un navegador
              real. Verás el avance paso a paso en vivo.
            </p>
          </div>
        </Card>
      </aside>
    </form>
  );
}

const SECURE_TYPES = new Set<TestType>([
  "login",
  "registro",
  "formulario",
  "ecommerce",
]);

const DYNAMIC_TITLE: Record<TestType, string> = {
  login: "Credenciales",
  registro: "Datos de registro",
  busqueda: "Parámetros de búsqueda",
  navegacion: "Pasos de navegación",
  formulario: "Datos del formulario",
  ecommerce: "Datos de compra",
};

const DYNAMIC_DESCRIPTION: Record<TestType, string> = {
  login: "Estructuradas y separadas de tu instrucción libre.",
  registro: "Se usan para dar de alta una cuenta nueva.",
  busqueda: "Lo que la IA escribirá en el buscador del sitio.",
  navegacion: "Este tipo no necesita campos adicionales.",
  formulario: "Cada par se rellenará en el campo correspondiente.",
  ecommerce: "Datos de pago de prueba para simular la compra.",
};

const PROMPT_SUGGESTIONS = [
  "Verificar que el dashboard carga",
  "Reintentar al fallar",
  "Capturar errores de consola",
];

function Section({
  title,
  description,
  step,
  badge,
  children,
}: {
  title: string;
  description: string;
  step?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <div className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            {step ? (
              <span className="text-faint font-mono text-[0.625rem] tracking-wider tabular-nums">
                {step}
              </span>
            ) : null}
            <h2 className="text-text text-sm font-semibold">{title}</h2>
            <span className="text-muted hidden truncate text-xs sm:inline">
              · {description}
            </span>
          </div>
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </div>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-faint font-mono text-[0.625rem] tracking-widest uppercase">
        {label}
      </dt>
      <dd className="max-w-[60%] min-w-0 text-right">{children}</dd>
    </div>
  );
}
