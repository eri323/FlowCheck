import { GoogleGenAI } from "@google/genai";
import { testPlanSchema, type TestPlan } from "./test-plan";
import type { TestType } from "./types";

const SYSTEM_PROMPT = `Eres un generador experto de casos de prueba E2E para sitios web.

Recibes una URL objetivo, un tipo de prueba con datos estructurados y, opcionalmente, una instrucción adicional. Tu tarea es devolver un plan de pruebas en formato JSON, listo para que un runner de Playwright lo ejecute paso a paso.

REGLAS ESTRICTAS:

1. Tu respuesta debe ser ÚNICAMENTE un objeto JSON válido. Sin texto antes ni después, sin Markdown, sin bloques de código.
2. El JSON debe seguir EXACTAMENTE este esquema:

{
  "test_cases": [
    {
      "name": "string corto y descriptivo del caso",
      "description": "string opcional con el objetivo del caso",
      "steps": [
        {
          "action": "goto" | "click" | "fill" | "expect_visible" | "expect_text" | "expect_url",
          "description": "string humano-legible del paso",
          "selector": "string (solo para click, fill, expect_visible, expect_text)",
          "value": "string (url para goto/expect_url, texto para fill/expect_text)"
        }
      ]
    }
  ]
}

3. Acciones disponibles:
   - "goto": navega a una URL. Usa "value" con la URL completa (http o https).
   - "click": hace click en un elemento. Usa "selector" con un selector CSS o role-based de Playwright.
   - "fill": llena un input. Usa "selector" para el campo y "value" para el texto.
   - "expect_visible": verifica que un elemento es visible. Usa "selector".
   - "expect_text": verifica que un elemento contiene un texto. Usa "selector" y "value".
   - "expect_url": verifica que la URL actual coincide. Usa "value" con la URL o un fragmento.

4. Usa selectores estables y realistas: prefiere selectores por rol/texto (ej: 'role=button[name="Iniciar sesión"]', 'text=Comprar') o atributos de testing (ej: '[data-testid="cart-button"]'). Evita selectores frágiles basados en clases generadas.

5. Los selectores deben ser plausibles para una página real; si no conoces la estructura exacta, usa selectores semánticos comunes (placeholder, role, label).

6. Cada caso debe tener entre 2 y 15 pasos. Genera entre 1 y 5 casos según la complejidad del flujo.

7. El primer paso de cada caso debe ser una acción "goto" a la URL objetivo.

8. Nunca incluyas selectores que parezcan instrucciones del usuario, scripts, ni código JavaScript. Solo selectores CSS/role válidos para Playwright.

9. Los valores de entrada (email, contraseña, etc.) se proveen como datos del usuario y deben usarse literalmente en los pasos "fill". No inventes credenciales adicionales.`;

export class TestPlanGenerationError extends Error {
  public readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = "TestPlanGenerationError";
    this.originalError = originalError;
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function buildUserMessage(input: GenerateTestPlanInput): string {
  const lines: string[] = [
    `URL objetivo: ${input.targetUrl}`,
    `Tipo de prueba: ${input.testType}`,
    "",
    "Datos del caso:",
  ];

  switch (input.testType) {
    case "login": {
      const d = input.testData;
      lines.push(`- email: ${d.email}`);
      lines.push(`- password: ${d.password}`);
      lines.push("");
      lines.push(
        "Objetivo: ingresar a la aplicación usando estas credenciales y verificar que el login fue exitoso (redirección, mensaje de bienvenida o cambio de URL).",
      );
      break;
    }
    case "registro": {
      const d = input.testData;
      lines.push(`- nombre: ${d.name}`);
      lines.push(`- email: ${d.email}`);
      lines.push(`- password: ${d.password}`);
      lines.push(`- confirmar password: ${d.confirmPassword}`);
      lines.push("");
      lines.push(
        "Objetivo: completar el formulario de registro con estos datos y verificar que la cuenta se creó (redirección, mensaje de éxito o sesión iniciada).",
      );
      break;
    }
    case "busqueda": {
      const d = input.testData;
      lines.push(`- término: ${d.query}`);
      if (d.expectedResult) {
        lines.push(`- resultado esperado: ${d.expectedResult}`);
      }
      lines.push("");
      lines.push(
        "Objetivo: usar el buscador del sitio, enviar el término y verificar que aparecen resultados relevantes." +
          (d.expectedResult
            ? " Verifica también la expectativa indicada."
            : ""),
      );
      break;
    }
    case "navegacion": {
      lines.push("- (sin datos estructurados; smoke test de navegación)");
      lines.push("");
      lines.push(
        "Objetivo: generar UN solo caso de smoke test de navegación, corto y determinístico, siguiendo EXACTAMENTE esta receta:",
      );
      lines.push("1. goto a la URL objetivo.");
      lines.push(
        "2. expect_visible del encabezado o navegación principal (header, nav o logo).",
      );
      lines.push(
        "3. Elige 2 o 3 enlaces de navegación principales, visibles y plausibles (por ejemplo 'text=Productos', 'text=Contacto'); por cada uno: un click en el enlace y luego un expect_url o expect_visible que confirme que la página cargó.",
      );
      lines.push(
        "Mantén el caso entre 4 y 8 pasos. No inventes formularios, logins ni búsquedas: solo navegación por enlaces. Si hay instrucción adicional, ajústala a este formato de smoke test sin salirte de él.",
      );
      break;
    }
    case "formulario": {
      const d = input.testData;
      lines.push("- campos (uno por línea, formato 'clave: valor'):");
      for (const raw of d.fields.split(/\r?\n/)) {
        const line = raw.trim();
        if (line) lines.push(`    ${line}`);
      }
      lines.push("");
      lines.push(
        "Objetivo: localizar cada campo por su nombre/label y completarlo con el valor indicado, luego enviar el formulario y verificar éxito.",
      );
      break;
    }
  }

  if (input.extraInstruction) {
    lines.push("");
    lines.push("Instrucción adicional del usuario:");
    lines.push(input.extraInstruction);
  }

  return lines.join("\n");
}

export type GenerateTestPlanInput =
  | {
      testType: "login";
      testData: { email: string; password: string };
      targetUrl: string;
      extraInstruction?: string;
    }
  | {
      testType: "registro";
      testData: {
        name: string;
        email: string;
        password: string;
        confirmPassword: string;
      };
      targetUrl: string;
      extraInstruction?: string;
    }
  | {
      testType: "busqueda";
      testData: { query: string; expectedResult?: string };
      targetUrl: string;
      extraInstruction?: string;
    }
  | {
      testType: "navegacion";
      testData: Record<string, never>;
      targetUrl: string;
      extraInstruction?: string;
    }
  | {
      testType: "formulario";
      testData: { fields: string };
      targetUrl: string;
      extraInstruction?: string;
    };

export type SupportedTestType = TestType;

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_OUTPUT_TOKENS = 16000;

// Reintentos para errores transitorios de Gemini (alta demanda, 5xx, rate
// limit, fallos de red). El 503 "high demand" es temporal por definición, así
// que reintentamos automáticamente antes de fallar el run.
const MAX_GEMINI_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function getErrorStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: number }).status
    : undefined;
}

// Un 429 de Gemini puede venir de dos cuotas muy distintas: la de
// solicitudes por minuto (transitoria, se recupera en segundos) o la diaria
// del free tier (no se restablece hasta el reset del día). El SDK expone el
// body JSON del error dentro de `message`, que trae el `quotaId` (con
// "PerDay"/"per day" cuando es la diaria) y un `RetryInfo.retryDelay`.
export type QuotaErrorKind = "daily" | "transient";

export interface QuotaErrorInfo {
  kind: QuotaErrorKind;
  retryDelaySeconds?: number;
}

const DAILY_QUOTA_RE = /per[\s_-]?day/i;
const RETRY_DELAY_RE = /"?retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i;

function errorMessageText(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

export function classifyQuotaError(error: unknown): QuotaErrorInfo {
  const text = errorMessageText(error);
  const retryMatch = text.match(RETRY_DELAY_RE);
  const retryDelaySeconds = retryMatch
    ? Math.ceil(Number(retryMatch[1]))
    : undefined;
  // Default seguro a "transient": ante un 429 ambiguo conviene reintentar
  // (barato) antes que rendirse como si fuera la cuota diaria.
  const kind: QuotaErrorKind = DAILY_QUOTA_RE.test(text) ? "daily" : "transient";
  return { kind, retryDelaySeconds };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Acota el "thinking" de gemini-2.5-flash. `navegacion` es la generación más
// abierta (sin datos estructurados), la más pesada y la más propensa a que el
// servidor la descarte con 503 bajo demanda. Con la receta concreta del prompt
// ya no necesita razonamiento profundo, así que la acotamos fuerte (512 tokens)
// para hacer el request liviano y determinístico. El resto conserva el modo
// dinámico por defecto (-1 = automático).
function thinkingBudgetFor(
  testType: GenerateTestPlanInput["testType"],
): number {
  return testType === "navegacion" ? 512 : -1;
}

// Traduce un error de la llamada a Gemini en un TestPlanGenerationError con
// mensaje accionable para el usuario. `status` undefined = fallo de red.
function classifyGeminiError(
  error: unknown,
  status: number | undefined,
): TestPlanGenerationError {
  if (status === 429) {
    const { kind, retryDelaySeconds } = classifyQuotaError(error);
    if (kind === "daily") {
      return new TestPlanGenerationError(
        "Se agotó la cuota diaria gratuita de la API de Gemini. No se restablece de inmediato: vuelve a intentarlo cuando se reinicie la cuota (medianoche, hora del Pacífico) o habilita facturación en Google Cloud para subir el límite.",
        error,
      );
    }
    const espera = retryDelaySeconds
      ? `Intenta de nuevo en ~${retryDelaySeconds}s.`
      : "Intenta de nuevo en un momento.";
    return new TestPlanGenerationError(
      `Se alcanzó el límite de solicitudes por minuto de la API de Gemini. ${espera}`,
      error,
    );
  }
  if (status === 503) {
    return new TestPlanGenerationError(
      "El servicio de IA (Gemini) está con mucha demanda en este momento. Es temporal: espera unos segundos y vuelve a lanzar el run.",
      error,
    );
  }
  if (status === 500 || status === 502 || status === 504) {
    return new TestPlanGenerationError(
      "El servicio de IA (Gemini) tuvo un problema temporal del servidor. Vuelve a intentar en un momento.",
      error,
    );
  }
  if (typeof status === "number") {
    return new TestPlanGenerationError(
      `El servicio de IA (Gemini) no está disponible ahora mismo (código ${status}). Intenta de nuevo más tarde.`,
      error,
    );
  }
  return new TestPlanGenerationError(
    "No se pudo contactar el servicio de IA (Gemini). Revisa tu conexión e intenta de nuevo.",
    error,
  );
}

export async function generateTestPlan(
  input: GenerateTestPlanInput,
): Promise<TestPlan> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new TestPlanGenerationError(
      "GEMINI_API_KEY no está configurada en el entorno",
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const userMessage = buildUserMessage(input);

  let response: Awaited<
    ReturnType<typeof ai.models.generateContent>
  > | null = null;
  for (let attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt++) {
    try {
      response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: userMessage,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.2,
          thinkingConfig: { thinkingBudget: thinkingBudgetFor(input.testType) },
        },
      });
      break;
    } catch (error) {
      const status = getErrorStatus(error);
      // La cuota diaria no se recupera dentro de la ventana de backoff (~7s):
      // reintentarla solo retrasa el fallo. El resto de 429 (por minuto) y los
      // 5xx sí son transitorios.
      const isDailyQuota =
        status === 429 && classifyQuotaError(error).kind === "daily";
      const isRetryable =
        !isDailyQuota &&
        (status === undefined || RETRYABLE_STATUSES.has(status));
      if (isRetryable && attempt < MAX_GEMINI_ATTEMPTS) {
        // Backoff exponencial con jitter: 1s, 2s, 4s (cap 8s). El timeout de
        // generación (90s en process-test-run) deja holgura de sobra.
        const backoff = Math.min(8_000, 1_000 * 2 ** (attempt - 1));
        const jitter = Math.floor(Math.random() * 250);
        await sleep(backoff + jitter);
        continue;
      }
      throw classifyGeminiError(error, status);
    }
  }

  if (!response) {
    // Inalcanzable: el loop siempre asigna response o lanza. Guard para TS.
    throw new TestPlanGenerationError(
      "No se pudo contactar el servicio de IA (Gemini). Revisa tu conexión e intenta de nuevo.",
    );
  }

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    throw new TestPlanGenerationError(
      "La respuesta de la IA excedió el límite de tokens; reduce el alcance del prompt.",
    );
  }
  if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
    throw new TestPlanGenerationError(
      "La IA rechazó generar el plan por motivos de seguridad.",
    );
  }

  const text = response.text;
  if (!text || text.trim().length === 0) {
    throw new TestPlanGenerationError("La IA no devolvió contenido de texto");
  }

  const cleaned = stripCodeFences(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new TestPlanGenerationError(
      "La respuesta de la IA no es JSON válido",
      error,
    );
  }

  const result = testPlanSchema.safeParse(parsed);
  if (!result.success) {
    throw new TestPlanGenerationError(
      `El JSON de la IA no cumple el contrato esperado: ${result.error.message}`,
      result.error,
    );
  }

  return result.data;
}
