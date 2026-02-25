"use server";

import { revalidatePath } from "next/cache";

import { TagError } from "@/lib/tags/errors";
import { createTag, renameTag } from "@/lib/tags/service";
import { createClient } from "@/lib/supabase/server";

export type ModalActionResult = { ok: true } | { ok: false; error: string };

export async function createTagModalAction(
  formData: FormData,
): Promise<ModalActionResult> {
  const supabase = await createClient();

  try {
    await createTag(supabase, {
      name: String(formData.get("name") ?? ""),
    });
  } catch (error) {
    if (error instanceof TagError) {
      return { ok: false, error: error.code };
    }
    return { ok: false, error: "FORBIDDEN" };
  }

  revalidatePath("/stock");
  return { ok: true };
}

export async function renameTagModalAction(
  formData: FormData,
): Promise<ModalActionResult> {
  const tagId = String(formData.get("tagId") ?? "").trim();
  if (!tagId) {
    return { ok: false, error: "TAG_NOT_FOUND" };
  }

  const supabase = await createClient();

  try {
    await renameTag(supabase, tagId, {
      name: String(formData.get("name") ?? ""),
    });
  } catch (error) {
    if (error instanceof TagError) {
      return { ok: false, error: error.code };
    }
    return { ok: false, error: "FORBIDDEN" };
  }

  revalidatePath("/stock");
  return { ok: true };
}
