import { LocationError, LOCATION_ERROR_CODES } from "@/lib/storage-locations/errors";

export type CreateLocationInput = {
  name: string;
};

export type RenameLocationInput = {
  name: string;
};

export function validateCreateLocationInput(input: CreateLocationInput): CreateLocationInput {
  return {
    name: validateName(input.name),
  };
}

export function validateRenameLocationInput(input: RenameLocationInput): RenameLocationInput {
  return {
    name: validateName(input.name),
  };
}

function validateName(raw: string): string {
  const name = raw.trim();
  if (!name) {
    throw new LocationError(LOCATION_ERROR_CODES.LOCATION_NAME_REQUIRED);
  }
  return name;
}
