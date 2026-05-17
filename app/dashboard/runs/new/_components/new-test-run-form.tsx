"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
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
  Globe,
  Pencil,
  Search,
  Shield,
  Terminal,
} from "@/components/ui/icons";

type IconComponent = (props: {
  size?: number;
  className?: string;
}) => React.JSX.Element;

const TYPE_META: Record<TestType, { icon: IconComponent; hint: string }> = {
  login: {
    icon: Shield,
    hint: "Probaremos que las credenciales permiten ingresar.",
  },
  registro: {
    icon: Pencil,
    hint: "Crearemos una cuenta nueva con estos datos.",
  },
  busqueda: { icon: Search, hint: "Usaremos el buscador del sitio." },
  navegacion: {
    icon: Cursor,
    hint: "Inferiremos los pasos desde tu instrucción libre.",
  },
  formulario: {
    icon: Terminal,
    hint: "Llenaremos un formulario con campos y valores.",
  },
  ecommerce: {
    icon: Bolt,
    hint: "Simularemos una compra con tarjeta de prueba.",
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
    const base = { target_url: targetUrl, prompt: extraPrompt || undefined };
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

  return (
    <Card>
      <form onSubmit={handleSubmit} className="divide-y divide-border">
        <FormSection
          title="URL objetivo"
          description="La página donde empezará la prueba."
        >
          <Field
            label="URL a probar"
            htmlFor="target_url"
            error={fieldError("target_url")}
          >
            <div className="relative">
              <Globe
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
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
        </FormSection>

        <FormSection
          title="Tipo de prueba"
          description="Cada tipo guía a la IA con la estructura correcta."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TEST_TYPES.map((type) => {
              const Icon = TYPE_META[type].icon;
              const active = type === testType;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTestType(type)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm transition-colors duration-150",
                    active
                      ? "border-accent bg-accent-subtle text-text"
                      : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
                  )}
                >
                  <Icon
                    size={16}
                    className={active ? "text-accent-text" : "text-faint"}
                  />
                  <span className="font-medium">{TEST_TYPE_LABELS[type]}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 text-xs text-muted">{TYPE_META[testType].hint}</p>
        </FormSection>

        <FormSection
          title={DYNAMIC_TITLE[testType]}
          description={DYNAMIC_DESCRIPTION[testType]}
          secure={SECURE_TYPES.has(testType)}
        >
          {testType === "login" ? (
            <div className="flex flex-col gap-4">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="flex flex-col gap-4">
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
            <p className="rounded-md border border-dashed border-border bg-surface-2 px-3 py-2.5 text-sm text-muted">
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
                rows={5}
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
            <div className="flex flex-col gap-4">
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
                hint="Usa la tarjeta de prueba de Stripe. Nunca una tarjeta real."
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
              <div className="grid grid-cols-2 gap-4">
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
            </div>
          ) : null}

          {testDataError ? (
            <p className="mt-3 text-xs text-danger-text">{testDataError}</p>
          ) : null}
        </FormSection>

        <FormSection
          title="Instrucción adicional"
          description="Contexto libre para afinar lo que genera la IA."
        >
          <Field
            label="Instrucción"
            htmlFor="extra-prompt"
            hint="No incluyas credenciales aquí, ya están en los campos cifrados."
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
        </FormSection>

        <div className="bg-surface-2 px-5 py-4 sm:px-6">
          {serverMessage ? (
            <p className="mb-3 flex items-start gap-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-text">
              <AlertCircle size={15} className="mt-px shrink-0" />
              <span>{serverMessage}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              La IA generará el plan y el worker lo ejecutará en un navegador
              real.
            </p>
            <Button type="submit" loading={isPending}>
              {isPending ? "Creando" : "Generar y ejecutar"}
            </Button>
          </div>
        </div>
      </form>
    </Card>
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
  login: "Se almacenan estructuradas y separadas de tu instrucción libre.",
  registro: "Se usan para dar de alta una cuenta nueva.",
  busqueda: "Lo que la IA escribirá en el buscador del sitio.",
  navegacion: "Este tipo no necesita campos adicionales.",
  formulario: "Cada par se rellenará en el campo correspondiente.",
  ecommerce: "Datos de pago de prueba para simular la compra.",
};

function FormSection({
  title,
  description,
  secure,
  children,
}: {
  title: string;
  description: string;
  secure?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {secure ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[0.6875rem] font-medium text-success-text">
            <Shield size={11} />
            campos cifrados
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
