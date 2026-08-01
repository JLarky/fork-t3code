import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

/**
 * STM owns sanitized HTML under `.stm-md`. T3 host styles that tree only —
 * no ChatMarkdown / innerHTML renderer in the liftSolid host path.
 */
describe("say-to-me stm-md host styles", () => {
  const css = NodeFS.readFileSync(
    NodePath.join(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "../index.css"),
    "utf8",
  );

  it("styles stm-md semantic HTML without a host markdown renderer", () => {
    expect(css).toContain("no host markdown renderer / innerHTML");
    for (const needle of [
      "say-to-me-voice-widget .stm-md",
      ".stm-md--compact",
      ".stm-md table",
      ".stm-md code",
      ".stm-md pre",
      ".stm-md ul",
      ".stm-md ol",
      ".stm-md blockquote",
      ".stm-md a",
    ]) {
      expect(css).toContain(needle);
    }
  });
});
