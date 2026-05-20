export const TEST_TYPES = [
  "login",
  "registro",
  "busqueda",
  "navegacion",
  "formulario",
  "ecommerce",
] as const;

export type TestType = (typeof TEST_TYPES)[number];
