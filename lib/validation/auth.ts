import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.email("Email inválido").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(72, "La contraseña no puede exceder 72 caracteres"),
});

export type Credentials = z.infer<typeof credentialsSchema>;

export type AuthFormState = {
  ok: boolean;
  message?: string;
  errors?: Partial<Record<keyof Credentials, string[]>>;
};
