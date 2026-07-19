import { normalizeDateText, validateProfile } from "./profiles.js";
import {
  cloudMode,
  getSession,
  loadProfiles,
  saveProfile,
  signIn,
  signOut
} from "./store.js";

const elements = {
  loginPanel: document.querySelector("#login-panel"),
  loginForm: document.querySelector("#login-form"),
  loginStatus: document.querySelector("#login-status"),
  localMode: document.querySelector("#local-mode"),
  layout: document.querySelector("#admin-layout"),
  storageMode: document.querySelector("#storage-mode"),
  profileList: document.querySelector("#profile-list"),
  newProfile: document.querySelector("#new-profile"),
  logout: document.querySelector("#logout-button"),
  form: document.querySelector("#profile-form"),
  editorTitle: document.querySelector("#editor-title"),
  editorVersion: document.querySelector("#editor-version"),
  errors: document.querySelector("#profile-errors"),
  saveStatus: document.querySelector("#save-status"),
  deactivate: document.querySelector("#delete-profile")
};

const state = { profiles: [], current: null };

function lines(value) {
  return String(value ?? "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function setFormValue(name, value) {
  const input = elements.form.elements.namedItem(name);
  if (input) input.value = value ?? "";
}

function showErrors(errors) {
  elements.errors.hidden = errors.length === 0;
  elements.errors.replaceChildren();
  if (!errors.length) return;
  const strong = document.createElement("strong");
  strong.textContent = "規則尚未儲存";
  const list = document.createElement("ul");
  for (const error of errors) {
    const item = document.createElement("li");
    item.textContent = error;
    list.append(item);
  }
  elements.errors.append(strong, list);
}

function blankProfile() {
  return {
    id: crypto.randomUUID(),
    active: true,
    version: 0,
    planName: "",
    planNumber: "",
    unit: "",
    hourlyRate: 196,
    earliestStart: "08:00",
    latestEnd: "18:00",
    allowedWeekdays: [1, 2, 3, 4, 5],
    blockedDates: [],
    location: {
      schoolOnly: false,
      requireRoom: false,
      requiredKeywords: [],
      prompt: "請填寫本次實際工作地點，不要照抄範例。",
      forbiddenKeywords: [],
      sampleValues: []
    },
    allowedWorkContents: [],
    note: ""
  };
}

function fillForm(profile) {
  state.current = structuredClone(profile);
  setFormValue("id", profile.id);
  elements.form.elements.active.checked = profile.active !== false;
  setFormValue("planName", profile.planName);
  setFormValue("planNumber", profile.planNumber);
  setFormValue("unit", profile.unit);
  setFormValue("hourlyRate", profile.hourlyRate);
  setFormValue("earliestStart", profile.earliestStart);
  setFormValue("latestEnd", profile.latestEnd);
  for (const checkbox of elements.form.querySelectorAll('input[name="allowedWeekdays"]')) {
    checkbox.checked = (profile.allowedWeekdays ?? []).includes(Number(checkbox.value));
  }
  elements.form.elements.schoolOnly.checked = profile.location?.schoolOnly ?? false;
  elements.form.elements.requireRoom.checked = profile.location?.requireRoom ?? false;
  setFormValue("locationPrompt", profile.location?.prompt);
  setFormValue("requiredKeywords", (profile.location?.requiredKeywords ?? []).join("\n"));
  setFormValue("forbiddenKeywords", (profile.location?.forbiddenKeywords ?? []).join("\n"));
  setFormValue("sampleValues", (profile.location?.sampleValues ?? []).join("\n"));
  setFormValue("allowedWorkContents", (profile.allowedWorkContents ?? []).join("\n"));
  setFormValue("blockedDates", (profile.blockedDates ?? []).join("\n"));
  setFormValue("note", profile.note);
  document.querySelector("#section-time").open =
    (profile.blockedDates ?? []).length > 0 || Boolean(profile.earliestStart || profile.latestEnd);
  document.querySelector("#section-location").open =
    Boolean(profile.location?.schoolOnly || profile.location?.requireRoom)
    || (profile.location?.requiredKeywords ?? []).length > 0
    || (profile.location?.forbiddenKeywords ?? []).length > 0
    || (profile.location?.sampleValues ?? []).length > 0;
  document.querySelector("#section-content").open =
    (profile.allowedWorkContents ?? []).length > 0 || Boolean(profile.note);
  elements.editorTitle.textContent = profile.version ? "編輯規則" : "新增計畫";
  elements.editorVersion.textContent = profile.version ? `上次儲存：${savedAtText(profile)}` : "填好基本資料就能儲存；儲存後學生頁重新整理即套用";
  elements.deactivate.hidden = !profile.version;
  elements.deactivate.textContent = profile.active === false ? "重新啟用計畫" : "停用計畫";
  elements.saveStatus.textContent = "";
  showErrors([]);
  updateListSelection();
}

function readForm() {
  return {
    id: elements.form.elements.id.value,
    active: elements.form.elements.active.checked,
    version: state.current?.version ?? 0,
    updatedAt: state.current?.updatedAt,
    planName: elements.form.elements.planName.value.trim(),
    planNumber: elements.form.elements.planNumber.value.trim(),
    unit: elements.form.elements.unit.value.trim(),
    hourlyRate: Number(elements.form.elements.hourlyRate.value),
    earliestStart: elements.form.elements.earliestStart.value,
    latestEnd: elements.form.elements.latestEnd.value,
    allowedWeekdays: [...elements.form.querySelectorAll('input[name="allowedWeekdays"]:checked')].map((input) => Number(input.value)),
    blockedDates: lines(elements.form.elements.blockedDates.value).map((value) => normalizeDateText(value) ?? value),
    location: {
      schoolOnly: elements.form.elements.schoolOnly.checked,
      requireRoom: elements.form.elements.requireRoom.checked,
      prompt: elements.form.elements.locationPrompt.value.trim(),
      requiredKeywords: lines(elements.form.elements.requiredKeywords.value),
      forbiddenKeywords: lines(elements.form.elements.forbiddenKeywords.value),
      sampleValues: lines(elements.form.elements.sampleValues.value)
    },
    allowedWorkContents: lines(elements.form.elements.allowedWorkContents.value),
    note: elements.form.elements.note.value.trim()
  };
}

function savedAtText(profile) {
  if (!profile.updatedAt) return "時間不明";
  const saved = new Date(profile.updatedAt);
  return Number.isNaN(saved.getTime())
    ? "時間不明"
    : saved.toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short", hour12: false });
}

function updateListSelection() {
  for (const button of elements.profileList.querySelectorAll("button")) {
    button.dataset.selected = button.dataset.profileId === state.current?.id ? "true" : "false";
  }
}

function renderList() {
  elements.profileList.replaceChildren();
  for (const profile of state.profiles) {
    const button = document.createElement("button");
    button.className = "button button--quiet admin-list__item";
    button.type = "button";
    button.dataset.profileId = profile.id;
    const title = document.createElement("span");
    title.textContent = `${profile.planNumber} · ${profile.planName}`;
    const meta = document.createElement("small");
    meta.className = "admin-list__meta";
    meta.textContent = `${profile.active === false ? "已停用" : "已啟用"} · ${savedAtText(profile)}`;
    if (profile.active === false) button.dataset.inactive = "true";
    button.append(title, meta);
    button.addEventListener("click", () => fillForm(profile));
    elements.profileList.append(button);
  }
  updateListSelection();
}

async function refresh(preferredId) {
  state.profiles = await loadProfiles({ includeInactive: true });
  renderList();
  const preferred = state.profiles.find((profile) => profile.id === preferredId) ?? state.profiles[0] ?? blankProfile();
  fillForm(preferred);
}

async function enterAdmin() {
  elements.loginPanel.hidden = true;
  elements.layout.hidden = false;
  elements.storageMode.textContent = cloudMode()
    ? "線上規則（GitHub）· 儲存後約 1~2 分鐘全裝置生效"
    : "本機規則 · 只影響這個瀏覽器";
  elements.logout.hidden = !cloudMode();
  await refresh();
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.loginStatus.textContent = "正在確認 Token…";
  try {
    await signIn(elements.loginForm.elements.token.value);
    elements.loginStatus.textContent = "";
    await enterAdmin();
  } catch (error) {
    elements.loginStatus.textContent = error.message;
    elements.loginStatus.dataset.tone = "error";
  }
});

elements.localMode.addEventListener("click", () => enterAdmin());

elements.newProfile.addEventListener("click", () => fillForm(blankProfile()));

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const profile = readForm();
  const errors = validateProfile(profile);
  if (state.profiles.some((item) => item.id !== profile.id && item.planNumber === profile.planNumber)) {
    errors.push("計畫編號已存在，請改用既有計畫或更正編號。");
  }
  showErrors(errors);
  if (errors.length) return;

  const button = document.querySelector("#save-profile");
  button.disabled = true;
  button.textContent = "正在儲存…";
  try {
    const saved = await saveProfile(profile);
    await refresh(saved.id);
    elements.saveStatus.textContent = cloudMode()
      ? "已儲存並發布到 GitHub，約 1~2 分鐘後學生頁生效。"
      : "已儲存（本機模式，只影響這個瀏覽器）。";
    elements.saveStatus.dataset.tone = "success";
  } catch (error) {
    elements.saveStatus.textContent = error.message;
    elements.saveStatus.dataset.tone = "error";
  } finally {
    button.disabled = false;
    button.textContent = "儲存規則";
  }
});

elements.deactivate.addEventListener("click", async () => {
  if (!state.current?.version) return;
  const reactivating = state.current.active === false;
  const verb = reactivating ? "重新啟用" : "停用";
  const effect = reactivating ? "學生頁重新整理後會再載入這份規則。" : "學生頁重新整理後就不會再載入這份規則。";
  if (!window.confirm(`確定要${verb}「${state.current.planName}」嗎？${effect}`)) return;
  try {
    const saved = await saveProfile({ ...state.current, active: reactivating });
    await refresh(saved.id);
    elements.saveStatus.textContent = `計畫已${verb}；${effect}`;
    elements.saveStatus.dataset.tone = "success";
  } catch (error) {
    elements.saveStatus.textContent = error.message;
    elements.saveStatus.dataset.tone = "error";
  }
});

elements.logout.addEventListener("click", async () => {
  await signOut();
  elements.layout.hidden = true;
  elements.loginPanel.hidden = false;
});

try {
  const session = await getSession();
  if (session) await enterAdmin();
  else elements.loginPanel.hidden = false;
} catch (error) {
  elements.loginPanel.hidden = false;
  elements.loginStatus.textContent = error.message;
}
