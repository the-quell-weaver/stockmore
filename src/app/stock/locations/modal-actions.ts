"use server";

import { revalidatePath } from "next/cache";

import { LocationError } from "@/lib/storage-locations/errors";
import {
  createStorageLocation,
  renameStorageLocation,
} from "@/lib/storage-locations/service";
import { createClient } from "@/lib/supabase/server";

export type ModalActionResult = { ok: true } | { ok: false; error: string };

export async function createLocationModalAction(
  formData: FormData,
): Promise<ModalActionResult> {
  const supabase = await createClient();

  try {
    await createStorageLocation(supabase, {
      name: String(formData.get("name") ?? ""),
    });
  } catch (error) {
    if (error instanceof LocationError) {
      return { ok: false, error: error.code };
    }
    return { ok: false, error: "FORBIDDEN" };
  }

  revalidatePath("/stock");
  return { ok: true };
}

export async function renameLocationModalAction(
  formData: FormData,
): Promise<ModalActionResult> {
  const locationId = String(formData.get("locationId") ?? "").trim();
  if (!locationId) {
    return { ok: false, error: "LOCATION_NOT_FOUND" };
  }

  const supabase = await createClient();

  try {
    await renameStorageLocation(supabase, locationId, {
      name: String(formData.get("name") ?? ""),
    });
  } catch (error) {
    if (error instanceof LocationError) {
      return { ok: false, error: error.code };
    }
    return { ok: false, error: "FORBIDDEN" };
  }

  revalidatePath("/stock");
  return { ok: true };
}
