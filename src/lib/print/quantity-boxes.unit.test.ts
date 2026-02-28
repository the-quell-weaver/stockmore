import { describe, expect, it } from "vitest";
import { renderQuantityBoxes } from "./quantity-boxes";

describe("renderQuantityBoxes", () => {
  it("returns empty string for 0", () => expect(renderQuantityBoxes(0)).toBe(""));
  it("returns empty string for negative", () => expect(renderQuantityBoxes(-3)).toBe(""));
  it("floors non-integers", () => expect(renderQuantityBoxes(1.9)).toBe("□"));
  it("returns 1 box for 1", () => expect(renderQuantityBoxes(1)).toBe("□"));
  it("returns 5 boxes without space for 5", () => expect(renderQuantityBoxes(5)).toBe("□□□□□"));
  it("groups 6 as 5+1 with space", () => expect(renderQuantityBoxes(6)).toBe("□□□□□ □"));
  it("groups 10 as 5+5 with space", () => expect(renderQuantityBoxes(10)).toBe("□□□□□ □□□□□"));
  it("groups 50 as 10 groups of 5", () => {
    const groups = renderQuantityBoxes(50).split(" ");
    expect(groups).toHaveLength(10);
    expect(groups.every((g) => g === "□□□□□")).toBe(true);
  });
});
