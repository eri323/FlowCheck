"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "./actions";
import type { AuthFormState } from "@/lib/validation/auth";
import { AuthLayout } from "@/app/_components/auth/auth-layout";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "@/components/ui/icons";

const initialState: AuthFormState = { ok: false };

export default function SignupPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(
    signupAction,
    initialState,
  );

  return (
    <AuthLayout
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            className="text-accent-text font-medium hover:underline"
          >
            Iniciar sesión
          </Link>
        </>
      }
    >
      <div className="border-border bg-surface shadow-e2 rounded-xl border p-6 sm:p-7">
        <h1 className="text-text text-xl font-semibold tracking-[-0.01em]">
          Crear cuenta
        </h1>
        <p className="text-muted mt-1 text-sm">
          Empieza a generar pruebas con IA en minutos.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <Field
            label="Email"
            htmlFor="email"
            error={state?.errors?.email?.[0]}
          >
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              invalid={Boolean(state?.errors?.email)}
            />
          </Field>

          <Field
            label="Contraseña"
            htmlFor="password"
            hint="Mínimo 8 caracteres."
            error={state?.errors?.password?.[0]}
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              invalid={Boolean(state?.errors?.password)}
            />
          </Field>

          {state?.message ? (
            <p className="bg-danger-bg text-danger-text flex items-start gap-2 rounded-md px-3 py-2 text-sm">
              <AlertCircle size={15} className="mt-px shrink-0" />
              <span>{state.message}</span>
            </p>
          ) : null}

          <Button type="submit" loading={pending} className="mt-1 w-full">
            {pending ? "Creando cuenta" : "Crear cuenta"}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
