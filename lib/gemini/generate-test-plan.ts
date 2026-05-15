import { GoogleGenAI } from "@google/genai";
import { testPlanSchema, type TestPlan } from "../validation/test-plan";
import type { TestType } from "../validation/test-run";

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
          (d.expectedResult ? " Verifica también la expectativa indicada." : ""),
      );
      break;
    }
    case "navegacion": {
      lines.push("- (sin datos estructurados; usar la instrucción libre)");
      lines.push("");
      lines.push(
        "Objetivo: inferir un flujo de navegación razonable a partir de la instrucción adicional. Si no hay instrucción, ejecuta un smoke test del home (carga y elementos principales visibles).",
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
    case "ecommerce": {
      const d = input.testData;
      lines.push(`- email comprador: ${d.email}`);
      lines.push(`- tarjeta: ${d.card}`);
      lines.push(`- vencimiento: ${d.expiry}`);
      lines.push(`- CVC: ${d.cvc}`);
      lines.push("");
      lines.push(
        "Objetivo: agregar un producto al carrito, ir a checkout, completar los datos de pago con la tarjeta de prueba indicada y verificar la confirmación de compra.",
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
  | { testType: "login"; testData: { email: string; password: string }; targetUrl: string; extraInstruction?: string }
  | {
      testType: "registro";
      testData: { name: string; email: string; password: string; confirmPassword: string };
      targetUrl: string;
      extraInstruction?: string;
    }
  | {
      testType: "busqueda";
      testData: { query: string; expectedResult?: string };
      targetUrl: string;
      extraInstruction?: string;
    }
  | { testType: "navegacion"; testData: Record<string, never>; targetUrl: string; extraInstruction?: string }
  | { testType: "formulario"; testData: { fields: string }; targetUrl: string; extraInstruction?: string }
  | {
      testType: "ecommerce";
      testData: { email: string; card: string; expiry: string; cvc: string };
      targetUrl: string;
      extraInstruction?: string;
    };

export type SupportedTestType = TestType;

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_OUTPUT_TOKENS = 16000;

export async function generateTestPlan(input: GenerateTestPlanInput): Promise<TestPlan> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new TestPlanGenerationError("GEMINI_API_KEY no está configurada en el entorno");
  }

  const ai = new GoogleGenAI({ apiKey });
  const userMessage = buildUserMessage(input);

  let response;
  try {
    response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: userMessage,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
      },
    });
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? (error as { status?: number }).status
        : undefined;
    if (status === 429) {
      throw new TestPlanGenerationError(
        "Se alcanzó el límite de la API de Gemini. Intenta de nuevo en un momento.",
        error,
      );
    }
    if (typeof status === "number") {
      const message = error instanceof Error ? error.message : String(error);
      throw new TestPlanGenerationError(
        `Error de la API de Gemini (status ${status}): ${message}`,
        error,
      );
    }
    throw new TestPlanGenerationError("Falló la llamada a Gemini", error);
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
    throw new TestPlanGenerationError("La respuesta de la IA no es JSON válido", error);
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
