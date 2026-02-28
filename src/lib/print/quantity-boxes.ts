export function renderQuantityBoxes(n: number): string {
  const count = Math.floor(n);
  if (count <= 0) return "";
  const groups: string[] = [];
  let i = 0;
  while (i < count) {
    const groupSize = Math.min(5, count - i);
    groups.push("□".repeat(groupSize));
    i += groupSize;
  }
  return groups.join(" ");
}
