"use client";

import type { RawSample } from "./engine/pipeline";

type DMEWithPermission = typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

/** Asks for motion access where the browser requires it (iPhone and iPad Safari). Must run in a tap handler. */
export async function requestMotionAccess(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") return "unsupported";
  const D = DeviceMotionEvent as DMEWithPermission;
  if (typeof D.requestPermission === "function") {
    try {
      return (await D.requestPermission()) === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }
  return "granted";
}

/** iPhone and iPad (iPadOS reports itself as a Mac with touch). */
export function isAppleTouch(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Asks for access (must run in a tap handler), then trusts what actually arrives. Newer desktop
 * Chrome also exposes requestPermission and answers "denied" when there is no sensor, so a
 * refusal only means "the user said no" on iPhone and iPad.
 */
export async function checkMotion(): Promise<"ok" | "nosensor" | "denied"> {
  const access = await requestMotionAccess();
  if (access === "unsupported") return "nosensor";
  if (await waitForMotion()) return "ok";
  return access === "denied" && isAppleTouch() ? "denied" : "nosensor";
}

const RAD = Math.PI / 180;

/**
 * Subscribes to the phone's accelerometer (including gravity, m/s^2) and gyroscope (converted
 * from deg/s to rad/s). Readings without a gyroscope are passed on with zero rotation.
 */
export function subscribeMotion(onSample: (s: RawSample) => void): () => void {
  const handler = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    const r = e.rotationRate;
    onSample({
      t: performance.now(),
      acc: [a.x, a.y, a.z],
      // rotationRate: beta about x, gamma about y, alpha about z
      gyro: r && r.alpha !== null && r.beta !== null && r.gamma !== null ? [r.beta * RAD, r.gamma * RAD, r.alpha * RAD] : [0, 0, 0],
    });
  };
  window.addEventListener("devicemotion", handler);
  return () => window.removeEventListener("devicemotion", handler);
}

/** Resolves true if real motion readings arrive within `ms` (laptops expose the API but send nothing). */
export function waitForMotion(ms = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const stop = subscribeMotion(() => {
      if (done) return;
      done = true;
      stop();
      resolve(true);
    });
    setTimeout(() => {
      if (done) return;
      done = true;
      stop();
      resolve(false);
    }, ms);
  });
}

/** Keeps the screen on while recording, where supported. */
export async function keepAwake(): Promise<() => void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const lock = await nav.wakeLock?.request("screen");
    return () => void lock?.release().catch(() => {});
  } catch {
    return () => {};
  }
}

/** CSV used by the recorder, the live page export and the analyzer (round-trips). */
export const CSV_HEADER = "time_ms,acc_x,acc_y,acc_z,gyro_x,gyro_y,gyro_z,label";
export function toCsv(rows: (RawSample & { label?: string })[]): string {
  const t0 = rows[0]?.t ?? 0;
  const lines = rows.map((r) => [(r.t - t0).toFixed(1), ...r.acc.map((v) => v.toFixed(4)), ...r.gyro.map((v) => v.toFixed(5)), r.label ?? ""].join(","));
  return [CSV_HEADER, ...lines].join("\n") + "\n";
}

export function download(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
