import { TagError, TAG_ERROR_CODES } from "@/lib/tags/errors";

export type CreateTagInput = {
  name: string;
};

export type RenameTagInput = {
  name: string;
};

export function validateCreateTagInput(input: CreateTagInput): CreateTagInput {
  return {
    name: validateName(input.name),
  };
}

export function validateRenameTagInput(input: RenameTagInput): RenameTagInput {
  return {
    name: validateName(input.name),
  };
}

function validateName(raw: string): string {
  const name = raw.trim();
  if (!name) {
    throw new TagError(TAG_ERROR_CODES.TAG_NAME_REQUIRED);
  }
  return name;
}
