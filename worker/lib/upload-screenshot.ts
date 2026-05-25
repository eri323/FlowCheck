import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "screenshots";

export class ScreenshotUploadError extends Error {
  public readonly originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = "ScreenshotUploadError";
    this.originalError = originalError;
  }
}

export async function uploadScreenshot(
  supabase: SupabaseClient,
  testRunId: string,
  stepId: string,
  png: Buffer,
): Promise<string> {
  const path = `${testRunId}/${stepId}.png`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, png, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new ScreenshotUploadError(
      `No se pudo subir el screenshot ${path}: ${uploadError.message}`,
      uploadError,
    );
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new ScreenshotUploadError(`No se obtuvo URL pública para ${path}`);
  }

  return data.publicUrl;
}
