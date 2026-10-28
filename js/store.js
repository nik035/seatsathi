// Data layer. Same API for Firebase (live) and Demo (browser localStorage).
import { FIREBASE_CONFIG } from "./config.js";
import { seedDemo } from "./seed.js";

const FB_VER = "10.12.2";
const useFirebase = !!FIREBASE_CONFIG.apiKey;

export const mode = useFirebase ? "live" : "demo";

let impl;

// ───────────────────────── Firebase ─────────────────────────
async function firebaseImpl() {
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const A = await import(`${base}/firebase-auth.js`);
  const F = await import(`${base}/firebase-firestore.js`);
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);

  const toUser = (u) => u && ({ uid: u.uid, email: u.email, name: u.displayName || "", photo: u.photoURL || "" });
  const snapList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data(), _path: d.ref.path }));

  return {
    onAuth(cb) { return A.onAuthStateChanged(auth, (u) => cb(toUser(u))); },
    async signInGoogle() {
      const p = new A.GoogleAuthProvider();
      p.setCustomParameters({ prompt: "select_account" });
      const r = await A.signInWithPopup(auth, p);
      return toUser(r.user);
    },
    async signUpEmail(name, email, pw) {
      const r = await A.createUserWithEmailAndPassword(auth, email, pw);
      await A.updateProfile(r.user, { displayName: name });
      return { ...toUser(r.user), name };
    },
    async signInEmail(email, pw) { return toUser((await A.signInWithEmailAndPassword(auth, email, pw)).user); },
    async resetPassword(email) { await A.sendPasswordResetEmail(auth, email); },
    async signOut() { await A.signOut(auth); },

    async get(path) {
      const s = await F.getDoc(F.doc(db, path));
      return s.exists() ? { id: s.id, ...s.data() } : null;
    },
    async set(path, data, merge = true) { await F.setDoc(F.doc(db, path), data, { merge }); },
    async add(col, data) { return (await F.addDoc(F.collection(db, col), data)).id; },
    async update(path, patch) { await F.updateDoc(F.doc(db, path), patch); },
    async remove(path) { await F.deleteDoc(F.doc(db, path)); },
    async list(col, field, value) {
      const c = F.collection(db, col);
      const q = field ? F.query(c, F.where(field, "==", value)) : c;
      return snapList(await F.getDocs(q));
    },
    async group(name) {
      const snap = await F.getDocs(F.collectionGroup(db, name));
      return snapList(snap);
    },
  };
}

// ───────────────────────── Demo (localStorage) ─────────────────────────
function demoImpl() {
  const KEY = "ss_db_v1", AUTH = "ss_auth_v1", SESS = "ss_session_v1";
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  let data = load(KEY, null);
  if (!data) { data = seedDemo(); save(KEY, data); }
  const persist = () => save(KEY, data);
  const listeners = new Set();
  const split = (path) => { const i = path.lastIndexOf("/"); return [path.slice(0, i), path.slice(i + 1)]; };
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const currentUser = () => {
    const uid = load(SESS, null); if (!uid) return null;
    const accts = load(AUTH, {});
    const a = Object.values(accts).find((x) => x.uid === uid);
    return a ? { uid: a.uid, email: a.email, name: a.name, photo: "" } : null;
  };
  const emit = () => { const u = currentUser(); listeners.forEach((cb) => cb(u)); };
  async function hash(s) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  return {
    onAuth(cb) { listeners.add(cb); setTimeout(() => cb(currentUser()), 0); return () => listeners.delete(cb); },
    async signInGoogle() { const e = new Error("Google sign-in works once Firebase is connected. In demo mode, use email or the demo buttons."); e.code = "demo/google"; throw e; },
    async signUpEmail(name, email, pw) {
      const accts = load(AUTH, {}); email = email.toLowerCase();
      if (accts[email]) { const e = new Error("An account with this email already exists. Sign in instead."); throw e; }
      if (pw.length < 6) throw new Error("Password needs at least 6 characters.");
      accts[email] = { uid: "u_" + rid(), email, name, pw: await hash(pw) };
      save(AUTH, accts); save(SESS, accts[email].uid); emit();
      return currentUser();
    },
    async signInEmail(email, pw) {
      const a = load(AUTH, {})[email.toLowerCase()];
      if (!a || a.pw !== (await hash(pw))) throw new Error("Wrong email or password.");
      save(SESS, a.uid); emit(); return currentUser();
    },
    async demoLogin(role) {
      const map = {
        student: { uid: "demo-student", email: "student@demo.seatsathi", name: "Riya Sharma" },
        owner: { uid: "demo-owner", email: "owner@demo.seatsathi", name: "Mahesh Gupta" },
        admin: { uid: "demo-admin", email: "admin@demo.seatsathi", name: "Site Admin" },
      };
      const accts = load(AUTH, {}); const m = map[role];
      accts[m.email] = { ...m, pw: "-" }; save(AUTH, accts); save(SESS, m.uid); emit();
      return currentUser();
    },
    async resetPassword() { throw new Error("Password reset emails work once Firebase is connected."); },
    async signOut() { localStorage.removeItem(SESS); emit(); },
    resetDemo() { data = seedDemo(); persist(); },

    async get(path) {
      const [c, id] = split(path); const d = data[c]?.[id];
      return d ? { id, ...clone(d) } : null;
    },
    async set(path, doc, merge = true) {
      const [c, id] = split(path); data[c] ??= {};
      data[c][id] = merge ? { ...(data[c][id] || {}), ...clone(doc) } : clone(doc); persist();
    },
    async add(col, doc) { const id = rid(); data[col] ??= {}; data[col][id] = clone(doc); persist(); return id; },
    async update(path, patch) {
      const [c, id] = split(path);
      if (!data[c]?.[id]) throw new Error("Record not found.");
      data[c][id] = { ...data[c][id], ...clone(patch) }; persist();
    },
    async remove(path) { const [c, id] = split(path); if (data[c]) delete data[c][id]; persist(); },
    async list(col, field, value) {
      return Object.entries(data[col] || {})
        .filter(([, d]) => !field || d[field] === value)
        .map(([id, d]) => ({ id, ...clone(d), _path: `${col}/${id}` }));
    },
    async group(name) {
      const out = [];
      for (const [c, docs] of Object.entries(data)) {
        if (c === name || c.endsWith("/" + name)) {
          for (const [id, d] of Object.entries(docs)) out.push({ id, ...clone(d), _path: `${c}/${id}` });
        }
      }
      return out;
    },
  };
}

export async function initStore() {
  impl = useFirebase ? await firebaseImpl() : demoImpl();
  return impl;
}
export const store = new Proxy({}, { get: (_, k) => impl?.[k] });
