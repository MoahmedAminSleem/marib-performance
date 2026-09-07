/* ============================================================
   MaribCloud — R23/R24 online sync layer
   Every server call the dashboard makes:
   session · login/logout · users · data (fetch + full month sync)
   settings (targets / groups / quota) · audit · storage
   All requests are same-origin with the signed session cookie.
   ============================================================ */
var MaribCloud = (function () {
  "use strict";

  function api(path, opts) {
    opts = opts || {};
    var init = {
      method: opts.method || "GET",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetch(path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var err = new Error((j && j.error) || ("HTTP " + r.status));
          err.status = r.status;
          throw err;
        }
        return j;
      });
    });
  }

  /* ---------- session ---------- */
  function session() { return api("/api/auth"); }
  function login(username, password, remember) {
    return api("/api/auth", { method: "POST", body: { username: username, password: password, remember: !!remember } });
  }
  function logout() { return api("/api/auth", { method: "DELETE" }); }

  /* ---------- users (admin) ---------- */
  function usersList() { return api("/api/users"); }
  function userCreate(username, password, admin) {
    return api("/api/users", { method: "POST", body: { username: username, password: password, admin: !!admin } });
  }
  function userUpdate(id, patch) {
    return api("/api/users", { method: "PUT", body: Object.assign({ id: id }, patch) });
  }
  function userDelete(id) { return api("/api/users?id=" + encodeURIComponent(id), { method: "DELETE" }); }
  /* R27: photos & titles are admin-set for ANY user from the users
     modal (the R26 self-service mePhoto is gone by request). */
  function userPhoto(userId, photo) {
    return api("/api/users", { method: "PUT", body: { id: userId, photo: photo } });
  }
  function userTitle(userId, title) {
    return api("/api/users", { method: "PUT", body: { id: userId, title: title } });
  }

  /* ---------- data ---------- */
  function dataGet() { return api("/api/data"); }
  function dataSync(month, pack, files) {
    return api("/api/data", { method: "POST", body: { month: month, pack: pack, files: files || [] } });
  }

  /* ---------- settings ---------- */
  function settingsGet() { return api("/api/settings"); }
  function settingsPut(key, value) {
    return api("/api/settings", { method: "PUT", body: { key: key, value: value } });
  }

  /* ---------- audit (dev) ---------- */
  function auditGet(from, to) {
    var qs = [];
    if (from) qs.push("from=" + encodeURIComponent(from));
    if (to) qs.push("to=" + encodeURIComponent(to));
    return api("/api/audit" + (qs.length ? "?" + qs.join("&") : ""));
  }

  /* ---------- storage (dev) ---------- */
  function storageGet() { return api("/api/storage"); }

  return {
    session: session, login: login, logout: logout,
    usersList: usersList, userCreate: userCreate, userUpdate: userUpdate, userDelete: userDelete,
    userPhoto: userPhoto, userTitle: userTitle,
    dataGet: dataGet, dataSync: dataSync,
    settingsGet: settingsGet, settingsPut: settingsPut,
    auditGet: auditGet, storageGet: storageGet
  };
})();
