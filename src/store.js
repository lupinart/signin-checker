import { createClient } from "@supabase/supabase-js";
import { DEFAULT_PROFILES } from "./profiles.js";

const STORAGE_KEY = "signin-checker:profiles";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudConfigured = Boolean(supabaseUrl && supabaseKey);
const client = cloudConfigured ? createClient(supabaseUrl, supabaseKey) : null;

function readLocal() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) && stored.length ? stored : structuredClone(DEFAULT_PROFILES);
  } catch {
    return structuredClone(DEFAULT_PROFILES);
  }
}

function writeLocal(profiles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export async function loadProfiles({ includeInactive = false } = {}) {
  if (!client) {
    const profiles = readLocal();
    return includeInactive ? profiles : profiles.filter((profile) => profile.active !== false);
  }

  let query = client.from("project_rules").select("payload").order("updated_at", { ascending: false });
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(`無法取得計畫規則：${error.message}`);
  return data.map((row) => row.payload);
}

export async function saveProfile(profile) {
  const saved = {
    ...structuredClone(profile),
    version: Number(profile.version ?? 0) + 1,
    updatedAt: new Date().toISOString()
  };

  if (!client) {
    const profiles = readLocal();
    const index = profiles.findIndex((item) => item.id === saved.id);
    if (index >= 0) profiles[index] = saved;
    else profiles.unshift(saved);
    writeLocal(profiles);
    return saved;
  }

  const { error } = await client.from("project_rules").upsert({
    id: saved.id,
    active: saved.active,
    version: saved.version,
    updated_at: saved.updatedAt,
    payload: saved
  });
  if (error) throw new Error(`無法儲存計畫規則：${error.message}`);
  return saved;
}

export async function deleteProfile(id) {
  if (!client) {
    writeLocal(readLocal().filter((profile) => profile.id !== id));
    return;
  }
  const { error } = await client.from("project_rules").delete().eq("id", id);
  if (error) throw new Error(`無法刪除計畫規則：${error.message}`);
}

export async function getSession() {
  if (!client) return { local: true };
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signIn(email, password) {
  if (!client) return { local: true };
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`登入失敗：${error.message}`);
  return data.session;
}

export async function signOut() {
  if (client) await client.auth.signOut();
}
