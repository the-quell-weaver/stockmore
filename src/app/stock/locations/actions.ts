"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LocationError } from "@/lib/storage-locations/errors";
import {
  createStorageLocation,
  renameStorageLocation,
} from "@/lib/storage-locations/service";
import { createClient } from "@/lib/supabase/server";

function redirectWithState(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  redirect(`/stock/locations?${query.toString()}`);
}

export async function createLocationAction(formData: FormData) {
  const supabase = await createClient();

  try {
    await createStorageLocation(supabase, {
      name: String(formData.get("name") ?? ""),
    });
  } catch (error) {
    if (error instanceof LocationError) {
      redirectWithState({ error: error.code });
    }
    redirectWithState({ error: "FORBIDDEN" });
  }

  revalidatePath("/stock/locations");
  redirectWithState({ success: "created" });
}

export async function renameLocationAction(formData: FormData) {
  const locationId = String(formData.get("locationId") ?? "").trim();
  if (!locationId) {
    redirectWithState({ error: "LOCATION_NOT_FOUND" });
  }

  const supabase = await createClient();

  try {
    await renameStorageLocation(supabase, locationId, {
      name: String(formData.get("name") ?? ""),
    });
  } catch (error) {
    if (error instanceof LocationError) {
      redirectWithState({ error: error.code });
    }
    redirectWithState({ error: "FORBIDDEN" });
  }

  revalidatePath("/stock/locations");
  redirectWithState({ success: "renamed" });
}
