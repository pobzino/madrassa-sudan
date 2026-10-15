import { describe, expect, it } from "vitest";
import { DOWNLOAD_ERROR_MESSAGES, DownloadError, toDownloadError } from "@/lib/offline/download-manager";
import {
  IOS_STORAGE_COPY,
  canSaveOfflineHere,
  iosStorageContext,
  iosTabNote,
  offlineSaveSupported,
} from "@/lib/offline/support";
import { isIosUserAgent } from "@/lib/pwa-install";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  ipadAsMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
};

describe("isIosUserAgent", () => {
  it("knows iPhones, and iPads that report a Mac but have touch", () => {
    expect(isIosUserAgent(UA.iphone)).toBe(true);
    expect(isIosUserAgent(UA.ipadAsMac, 5)).toBe(true);
    expect(isIosUserAgent(UA.ipadAsMac, 0)).toBe(false);
    expect(isIosUserAgent(UA.android, 5)).toBe(false);
  });
});

describe("iosStorageContext", () => {
  it("names the iPhone storage each browser and the home-screen app use", () => {
    expect(iosStorageContext("ios-safari", true)).toBe("safari");
    expect(iosStorageContext("ios-browser", true)).toBe("browser");
    expect(iosStorageContext("ios-in-app", true)).toBe("in-app");
    expect(iosStorageContext("installed", true)).toBe("installed");
  });

  it("is null off iPhone (Android's installed app shares Chrome's storage) and before hydration", () => {
    expect(iosStorageContext("installed", false)).toBeNull();
    expect(iosStorageContext("android-chrome-waiting", false)).toBeNull();
    expect(iosStorageContext("desktop", false)).toBeNull();
    expect(iosStorageContext(null, true)).toBeNull();
  });
});

describe("iosTabNote", () => {
  it("names Safari only in Safari, and shows nothing in the installed app or off iPhone", () => {
    expect(iosTabNote("safari", "en")).toBe(IOS_STORAGE_COPY.en.tabNote.safari);
    expect(iosTabNote("browser", "en")).toBe(IOS_STORAGE_COPY.en.tabNote.other);
    expect(iosTabNote("in-app", "ar")).toBe(IOS_STORAGE_COPY.ar.tabNote.other);
    expect(iosTabNote("browser", "en")).not.toContain("Safari");
    expect(iosTabNote("installed", "en")).toBeNull();
    expect(iosTabNote(null, "ar")).toBeNull();
  });

  it("writes the brand as on the home screen icon, with iPhone and Safari in Latin letters", () => {
    for (const text of [
      IOS_STORAGE_COPY.ar.tabNote.safari,
      IOS_STORAGE_COPY.ar.tabNote.other,
      IOS_STORAGE_COPY.ar.appEmpty,
    ]) {
      expect(text).not.toMatch(/(^|[\s،.])أمل([\s،.]|$)/);
      expect(text).not.toMatch(/الآيفون|سفاري/);
    }
    expect(IOS_STORAGE_COPY.ar.tabNote.safari).toContain("آمال");
  });
});

describe("offlineSaveSupported", () => {
  const env = { secureContext: true, serviceWorker: true, cacheStorage: true, indexedDB: true };

  it("allows Safari, Chrome and the installed app", () => {
    expect(offlineSaveSupported({ ...env, platform: "ios-safari" })).toBe(true);
    expect(offlineSaveSupported({ ...env, platform: "installed" })).toBe(true);
    expect(offlineSaveSupported({ ...env, platform: "android-chrome-waiting" })).toBe(true);
    // Android in-app browsers do run service workers.
    expect(offlineSaveSupported({ ...env, platform: "android-in-app" })).toBe(true);
  });

  it("refuses iPhone in-app browsers and browsers missing what offline needs", () => {
    expect(offlineSaveSupported({ ...env, platform: "ios-in-app" })).toBe(false);
    expect(offlineSaveSupported({ ...env, serviceWorker: false, platform: "desktop" })).toBe(false);
    expect(offlineSaveSupported({ ...env, cacheStorage: false, platform: "desktop" })).toBe(false);
    expect(offlineSaveSupported({ ...env, indexedDB: false, platform: "desktop" })).toBe(false);
    expect(offlineSaveSupported({ ...env, secureContext: false, platform: "desktop" })).toBe(false);
  });

  it("is false on the server", () => {
    expect(canSaveOfflineHere()).toBe(false);
  });
});

describe("toDownloadError", () => {
  const domError = (name: string) => new DOMException("failed", name);

  it("reads a failed write to the phone as storage, whatever the browser calls it", () => {
    expect(toDownloadError(domError("QuotaExceededError")).code).toBe("storage_full");
    expect(toDownloadError(domError("UnknownError"), true).code).toBe("storage_full");
    expect(toDownloadError(domError("InvalidStateError"), true).code).toBe("storage_full");
    expect(toDownloadError(new Error("write failed"), true).code).toBe("storage_full");
  });

  it("keeps network failures as network, also while writing", () => {
    expect(toDownloadError(new TypeError("Load failed"), true).code).toBe("network");
    expect(toDownloadError(domError("AbortError"), true).code).toBe("network");
    expect(toDownloadError(domError("TimeoutError"), true).code).toBe("network");
  });

  it("leaves earlier failures as before", () => {
    expect(toDownloadError(new Error("odd")).code).toBe("unknown");
    expect(toDownloadError({ message: "JWT expired", code: "PGRST301" }).code).toBe("network");
    expect(toDownloadError(new DownloadError("no_audio"), true).code).toBe("no_audio");
  });
});

describe("download messages", () => {
  it("write the brand as آمال, not أمل", () => {
    for (const [code, copy] of Object.entries(DOWNLOAD_ERROR_MESSAGES)) {
      expect(copy.ar, code).not.toMatch(/(^|[\s،.])أمل([\s،.]|$)/);
    }
  });
});
