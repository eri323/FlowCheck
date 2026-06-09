export const TEST_TYPES = [
  "login",
  "registro",
  "busqueda",
  "navegacion",
  "formulario",
] as const;

export type TestType = (typeof TEST_TYPES)[number];
