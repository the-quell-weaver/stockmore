"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { TagError } from "@/lib/tags/errors";
import { createTag, renameTag } from "@/lib/tags/service";
import { createClient } from "@/lib/supabase/server";

function redirectWithState(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  redirect(`/stock/tags?${query.toString()}`);
}

export async function createTagAction(formData: FormData) {
  const supabase = await createClient();

  try {
    await createTag(supabase, {
      name: String(formData.get("name") ?? ""),
    });
  } catch (error) {
    if (error instanceof TagError) {
      redirectWithState({ error: error.code });
    }
    redirectWithState({ error: "FORBIDDEN" });
  }

  revalidatePath("/stock/tags");
  redirectWithState({ success: "created" });
}

export async function renameTagAction(formData: FormData) {
  const tagId = String(formData.get("tagId") ?? "").trim();
  if (!tagId) {
    redirectWithState({ error: "TAG_NOT_FOUND" });
  }

  const supabase = await createClient();

  try {
    await renameTag(supabase, tagId, {
      name: String(formData.get("name") ?? ""),
    });
  } catch (error) {
    if (error instanceof TagError) {
      redirectWithState({ error: error.code });
    }
    redirectWithState({ error: "FORBIDDEN" });
  }

  revalidatePath("/stock/tags");
  redirectWithState({ success: "renamed" });
}
