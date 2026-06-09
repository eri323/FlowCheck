"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "./actions";
import type { AuthFormState } from "@/lib/validation/auth";
import { SplitAuthLayout } from "@/app/_components/auth/split-auth-layout";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "@/components/ui/icons";

const initialState: AuthFormState = { ok: false };

export default function LoginPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <SplitAuthLayout
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link
            href="/signup"
            className="text-accent-text font-medium hover:underline"
          >
            Crear cuenta
          </Link>
        </>
      }
    >
      <div className="border-border bg-surface shadow-e2 rounded-xl border p-6 sm:p-7">
        <h1 className="text-text text-xl font-semibold tracking-[-0.01em]">
          Iniciar sesión
        </h1>
        <p className="text-muted mt-1 text-sm">
          Accede a tu panel de pruebas automatizadas.
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
            error={state?.errors?.password?.[0]}
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
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
            {pending ? "Entrando" : "Entrar"}
          </Button>
        </form>
      </div>
    </SplitAuthLayout>
  );
}
