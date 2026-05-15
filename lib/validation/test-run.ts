import { z } from "zod";

const httpUrlSchema = z
  .string()
  .trim()
  .min(1, "La URL es obligatoria")
  .max(2048, "La URL es demasiado larga")
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "La URL debe usar http o https" },
  );

const extraPromptSchema = z
  .string()
  .trim()
  .max(2000, "La instrucción no puede exceder 2000 caracteres")
  .optional()
  .or(z.literal("").transform(() => undefined));

const passwordSchema = z
  .string()
  .min(1, "La contraseña es obligatoria")
  .max(200, "La contraseña es demasiado larga");

const loginDataSchema = z.object({
  email: z.email("Email inválido").max(320),
  password: passwordSchema,
});
export type LoginData = z.infer<typeof loginDataSchema>;

const registroDataSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
    email: z.email("Email inválido").max(320),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
    confirmPassword: z.string().min(1, "Confirma la contraseña").max(200),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });
export type RegistroData = z.infer<typeof registroDataSchema>;

const busquedaDataSchema = z.object({
  query: z.string().trim().min(1, "El término de búsqueda es obligatorio").max(500),
  expectedResult: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type BusquedaData = z.infer<typeof busquedaDataSchema>;

const navegacionDataSchema = z.object({}).strict();
export type NavegacionData = z.infer<typeof navegacionDataSchema>;

const formularioDataSchema = z.object({
  fields: z
    .string()
    .trim()
    .min(1, "Indica al menos un par campo:valor")
    .max(2000, "Demasiados campos"),
});
export type FormularioData = z.infer<typeof formularioDataSchema>;

const ecommerceDataSchema = z.object({
  email: z.email("Email inválido").max(320),
  card: z
    .string()
    .trim()
    .min(12, "Tarjeta inválida")
    .max(25, "Tarjeta inválida")
    .regex(/^[0-9 ]+$/, "Solo dígitos y espacios"),
  expiry: z
    .string()
    .trim()
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Formato MM/AA"),
  cvc: z
    .string()
    .trim()
    .regex(/^\d{3,4}$/, "CVC inválido"),
});
export type EcommerceData = z.infer<typeof ecommerceDataSchema>;

const baseFields = {
  target_url: httpUrlSchema,
  prompt: extraPromptSchema,
  project_id: z.uuid().optional(),
};

export const createTestRunSchema = z.discriminatedUnion("test_type", [
  z.object({ test_type: z.literal("login"), test_data: loginDataSchema, ...baseFields }),
  z.object({ test_type: z.literal("registro"), test_data: registroDataSchema, ...baseFields }),
  z.object({ test_type: z.literal("busqueda"), test_data: busquedaDataSchema, ...baseFields }),
  z.object({ test_type: z.literal("navegacion"), test_data: navegacionDataSchema, ...baseFields }),
  z.object({ test_type: z.literal("formulario"), test_data: formularioDataSchema, ...baseFields }),
  z.object({ test_type: z.literal("ecommerce"), test_data: ecommerceDataSchema, ...baseFields }),
]);

export type CreateTestRunInput = z.infer<typeof createTestRunSchema>;

export const TEST_TYPES = [
  "login",
  "registro",
  "busqueda",
  "navegacion",
  "formulario",
  "ecommerce",
] as const;

export type TestType = (typeof TEST_TYPES)[number];

export const TEST_TYPE_LABELS: Record<TestType, string> = {
  login: "Login",
  registro: "Registro",
  busqueda: "Búsqueda",
  navegacion: "Navegación",
  formulario: "Formulario",
  ecommerce: "E-commerce",
};
