import { DEFAULT_PROFILES } from "./profiles.js";

const STORAGE_KEY = "signin-checker:profiles";
const TOKEN_KEY = "signin-checker:github-token";
const REPO = "lupinart/signin-checker";
const RULES_PATH = "public/rules.json";
const CONTENTS_API = `https://api.github.com/repos/${REPO}/contents/${RULES_PATH}`;

function token() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function cloudMode() {
  return Boolean(token());
}

function apiHeaders(tokenValue = token()) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${tokenValue}`
  };
}

function decodeContent(base64) {
  const binary = atob(base64.replaceAll("\n", ""));
  const bytes = Uint8Array.from(binary, (character) => character.codePointAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeContent(textValue) {
  const bytes = new TextEncoder().encode(textValue);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function readLocal() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) && stored.length ? stored : null;
  } catch {
    return null;
  }
}

function writeLocal(profiles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

async function fetchPublished() {
  try {
    const response = await fetch(`./rules.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const parsed = await response.json();
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchRemoteRules() {
  const response = await fetch(CONTENTS_API, { headers: apiHeaders(), cache: "no-store" });
  if (!response.ok) throw new Error(`無法讀取線上規則（GitHub 回應 ${response.status}），請確認 Token 是否過期。`);
  const data = await response.json();
  return { profiles: JSON.parse(decodeContent(data.content)), sha: data.sha };
}

async function localProfiles() {
  return readLocal() ?? await fetchPublished() ?? structuredClone(DEFAULT_PROFILES);
}

export async function loadProfiles({ includeInactive = false } = {}) {
  const profiles = cloudMode() ? (await fetchRemoteRules()).profiles : await localProfiles();
  return includeInactive ? profiles : profiles.filter((profile) => profile.active !== false);
}

function upsert(profiles, saved) {
  const index = profiles.findIndex((item) => item.id === saved.id);
  if (index >= 0) profiles[index] = saved;
  else profiles.unshift(saved);
  return profiles;
}

export async function saveProfile(profile) {
  const saved = {
    ...structuredClone(profile),
    version: Number(profile.version ?? 0) + 1,
    updatedAt: new Date().toISOString()
  };

  if (!cloudMode()) {
    writeLocal(upsert(await localProfiles(), saved));
    return saved;
  }

  const { profiles, sha } = await fetchRemoteRules();
  const response = await fetch(CONTENTS_API, {
    method: "PUT",
    headers: apiHeaders(),
    body: JSON.stringify({
      message: `rules: ${saved.planNumber} ${saved.planName}`,
      content: encodeContent(`${JSON.stringify(upsert(profiles, saved), null, 2)}\n`),
      sha
    })
  });
  if (!response.ok) throw new Error(`無法儲存到 GitHub（回應 ${response.status}），請確認 Token 是否過期或沒有寫入權限。`);
  return saved;
}

export async function getSession() {
  return cloudMode() ? { cloud: true } : null;
}

export async function signIn(tokenValue) {
  const trimmed = String(tokenValue ?? "").trim();
  if (!trimmed) throw new Error("請貼上 GitHub Token。");
  const response = await fetch(`https://api.github.com/repos/${REPO}`, { headers: apiHeaders(trimmed) });
  if (!response.ok) throw new Error("Token 無效，或沒有這個 repo 的權限。");
  const data = await response.json();
  if (!data.permissions?.push) throw new Error("這個 Token 沒有寫入權限；建立時要在 Contents 勾「Read and write」。");
  localStorage.setItem(TOKEN_KEY, trimmed);
  return { cloud: true };
}

export async function signOut() {
  localStorage.removeItem(TOKEN_KEY);
}
