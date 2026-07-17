import { DEFAULT_PROFILES, validateProfile } from "./profiles.js";
import {
  cloudConfigured,
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
  elements.editorTitle.textContent = profile.version ? "編輯規則" : "新增計畫";
  elements.editorVersion.textContent = profile.version ? `目前版本 ${profile.version} · ${profile.updatedAt ?? "尚無更新時間"}` : "儲存後建立第一個版本";
  elements.deactivate.hidden = !profile.version;
  elements.saveStatus.textContent = "";
  showErrors([]);
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
    blockedDates: lines(elements.form.elements.blockedDates.value),
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

function renderList() {
  elements.profileList.replaceChildren();
  for (const profile of state.profiles) {
    const button = document.createElement("button");
    button.className = "button button--quiet";
    button.type = "button";
    button.textContent = `${profile.active === false ? "已停用 · " : ""}${profile.planNumber} · ${profile.planName}`;
    button.addEventListener("click", () => fillForm(profile));
    elements.profileList.append(button);
  }
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
  elements.storageMode.textContent = cloudConfigured ? "線上規則 · 儲存後所有裝置更新" : "本機規則 · 只影響這個瀏覽器";
  elements.logout.hidden = !cloudConfigured;
  await refresh();
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.loginStatus.textContent = "正在登入…";
  try {
    await signIn(elements.loginForm.elements.email.value, elements.loginForm.elements.password.value);
    elements.loginStatus.textContent = "";
    await enterAdmin();
  } catch (error) {
    elements.loginStatus.textContent = error.message;
    elements.loginStatus.dataset.tone = "error";
  }
});

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
    elements.saveStatus.textContent = `已儲存規則版本 ${saved.version}。`;
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
  if (!state.current) return;
  const saved = await saveProfile({ ...readForm(), active: false });
  await refresh(saved.id);
  elements.saveStatus.textContent = "計畫已停用；學生頁不會再載入這份規則。";
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

if (!cloudConfigured && !localStorage.getItem("signin-checker:profiles")) {
  localStorage.setItem("signin-checker:profiles", JSON.stringify(DEFAULT_PROFILES));
}
