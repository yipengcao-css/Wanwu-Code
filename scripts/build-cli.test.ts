import { describe, expect, it } from "vitest";
import { stripLeadingShebang, withNodeShebang } from "./build-cli.mjs";

describe("build-cli shebang", () => {
  it("strips a leading shebang line", () => {
    expect(stripLeadingShebang("#!/usr/bin/env node\nexport const x = 1;\n")).toBe(
      "export const x = 1;\n",
    );
  });

  it("leaves files without a shebang unchanged", () => {
    expect(stripLeadingShebang("export const x = 1;\n")).toBe("export const x = 1;\n");
  });

  it("ensures a single Node shebang", () => {
    expect(withNodeShebang("#!/usr/bin/env node\nexport const x = 1;\n")).toBe(
      "#!/usr/bin/env node\nexport const x = 1;\n",
    );
    expect(withNodeShebang("export const x = 1;\n")).toBe("#!/usr/bin/env node\nexport const x = 1;\n");
  });
});
