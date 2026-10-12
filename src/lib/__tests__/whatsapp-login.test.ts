import { describe, expect, it } from "vitest";
import {
  loginWhatsappNumberToEmail,
  whatsappNumberWithCountryCode,
} from "@/lib/whatsapp-login";

describe("whatsappNumberWithCountryCode", () => {
  it("adds the selected country code and removes a local trunk prefix", () => {
    expect(whatsappNumberWithCountryCode("+249", "0912 345 678")).toBe("+249912345678");
  });

  it("normalizes Arabic numerals in the selected code and local number", () => {
    expect(whatsappNumberWithCountryCode("+٢٤٩", "٠٩١٢٣٤٥٦٧٨")).toBe("+249912345678");
  });

  it("uses the selected calling code when a parent enters a local login number", () => {
    expect(loginWhatsappNumberToEmail("090 227 8021", "+249"))
      .toBe("wa-249902278021@parents.amalschool.app");
  });

  it("preserves an international login number regardless of the selected country", () => {
    expect(loginWhatsappNumberToEmail("+971 54 502 8651", "+249"))
      .toBe("wa-971545028651@parents.amalschool.app");
  });
});
