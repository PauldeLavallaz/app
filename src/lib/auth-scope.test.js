import { describe, expect, it } from "bun:test";
import { getAuthScopeKey } from "./auth-scope";

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
});
