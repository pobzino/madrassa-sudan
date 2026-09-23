import { describe, expect, it } from "vitest";
import { whatsappNumberWithCountryCode } from "@/lib/whatsapp-login";

describe("whatsappNumberWithCountryCode", () => {
  it("adds the selected country code and removes a local trunk prefix", () => {
    expect(whatsappNumberWithCountryCode("+249", "0912 345 678")).toBe("+249912345678");
  });

  it("normalizes Arabic numerals in the selected code and local number", () => {
    expect(whatsappNumberWithCountryCode("+٢٤٩", "٠٩١٢٣٤٥٦٧٨")).toBe("+249912345678");
  });
});
