"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  credentialsSchema,
  type AuthFormState,
} from "@/lib/validation/auth";

export async function signupAction(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  // Con la confirmación de email desactivada, signUp deja una sesión activa.
  // La cerramos para que el usuario inicie sesión manualmente desde /login
  // (si no, el middleware lo rebotaría directo a /dashboard).
  await supabase.auth.signOut({ scope: "local" });

  redirect("/login?registered=1");
}
