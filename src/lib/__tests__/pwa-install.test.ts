import { describe, expect, it } from "vitest";
import { classifyBrowser, openInChromeUrl } from "@/lib/pwa-install";

const UA = {
  androidChrome: "Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  androidFacebook:
    "Mozilla/5.0 (Linux; Android 13; TECNO KI5) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:129.0) Gecko/129.0 Firefox/129.0",
  androidOpera:
    "Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 OPR/84.0.0.0",
  androidWebView: "Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.0.0 Mobile Safari/537.36",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.0.0 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  desktopChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
};

const browser = { standalone: false, canPrompt: false };

describe("install route for each phone", () => {
  it("uses one tap where the browser offers it", () => {
    expect(classifyBrowser(UA.androidChrome, { ...browser, canPrompt: true })).toBe("one-tap");
    expect(classifyBrowser(UA.desktopChrome, { ...browser, canPrompt: true })).toBe("one-tap");
  });

  it("sends Samsung Internet to Chrome, since Play Protect blocks Samsung's installs", () => {
    expect(classifyBrowser(UA.samsungInternet, { ...browser, canPrompt: true })).toBe("android-samsung");
    expect(classifyBrowser(UA.samsungInternet, browser)).toBe("android-samsung");
  });

  it("waits for Chrome's one-tap install, and uses the ⋮ menu in browsers without it", () => {
    expect(classifyBrowser(UA.androidChrome, browser)).toBe("android-chrome-waiting");
    expect(classifyBrowser(UA.androidFirefox, browser)).toBe("android-menu");
    expect(classifyBrowser(UA.androidOpera, browser)).toBe("android-menu");
  });

  it("sends people in other apps' browsers to Chrome or Safari first", () => {
    expect(classifyBrowser(UA.androidFacebook, { ...browser, canPrompt: true })).toBe("android-in-app");
    expect(classifyBrowser(UA.androidWebView, browser)).toBe("android-in-app");
    expect(classifyBrowser(UA.iphoneInstagram, browser)).toBe("ios-in-app");
  });

  it("tells Safari and other iPhone browsers apart, including iPads that look like Macs", () => {
    expect(classifyBrowser(UA.iphoneSafari, browser)).toBe("ios-safari");
    expect(classifyBrowser(UA.iphoneChrome, browser)).toBe("ios-browser");
    expect(classifyBrowser(UA.ipad, { ...browser, touchPoints: 5 })).toBe("ios-safari");
    expect(classifyBrowser(UA.ipad, browser)).toBe("desktop");
  });

  it("knows when Amal is already open from the home screen", () => {
    expect(classifyBrowser(UA.iphoneSafari, { ...browser, standalone: true })).toBe("installed");
  });
});

describe("opening in Chrome from another app", () => {
  it("builds an Android intent link with a web fallback", () => {
    expect(openInChromeUrl("https://amalschool.org", "/app?lang=ar")).toBe(
      "intent://amalschool.org/app?lang=ar#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Famalschool.org%2Fapp%3Flang%3Dar;end",
    );
  });
});
