import type { PlatformCapabilities } from "../domain/diary";

let kind: PlatformCapabilities["kind"] = "unknown";

// #ifdef APP-PLUS
kind = "app";
// #endif

// #ifdef MP-WEIXIN
kind = "mp-weixin";
// #endif

// #ifdef H5
kind = "h5";
// #endif

const hasUniRuntime = typeof uni !== "undefined";

export const uniPlatformCapabilities: PlatformCapabilities = {
  kind,
  localPersistence:
    hasUniRuntime &&
    typeof uni.getStorageSync === "function" &&
    typeof uni.setStorageSync === "function",
  canvas: hasUniRuntime && typeof uni.createCanvasContext === "function",
};
