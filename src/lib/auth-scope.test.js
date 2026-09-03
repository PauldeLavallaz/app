import { describe, expect, it } from "bun:test";
import { getAuthScopeKey, reconcileAuthScopeCache } from "./auth-scope";

describe("getAuthScopeKey", () => {
  it("changes whenever the active organization changes", () => {
    expect(getAuthScopeKey("user_1", "org_mallplaza")).not.toBe(
      getAuthScopeKey("user_1", "org_morfeo"),
    );
  });

  it("keeps personal scope separate from every organization", () => {
    expect(getAuthScopeKey("user_1", null)).not.toBe(
      getAuthScopeKey("user_1", "org_mallplaza"),
    );
  });

  it("clears shared query state exactly once when the scope changes", () => {
    let clearCount = 0;
    const clearCache = () => {
      clearCount += 1;
    };

    expect(
      reconcileAuthScopeCache("user_1:org_a", "user_1:org_a", clearCache),
    ).toBe(false);
    expect(clearCount).toBe(0);

    expect(
      reconcileAuthScopeCache("user_1:org_a", "user_1:org_b", clearCache),
    ).toBe(true);
    expect(clearCount).toBe(1);
  });
});
