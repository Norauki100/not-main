import hashlib, json, os, re, sys, urllib.parse, urllib.request, webbrowser, zipfile
import webview

API = "https://api.modrinth.com/v2"
UA = {"User-Agent": "easy-mod-installer/1.0 (personal tool)"}
CFG_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "EasyModInstaller")
CFG = os.path.join(CFG_DIR, "config.json")


def base():
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def get_json(path):
    req = urllib.request.Request(API + path, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def post_json(path, body):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode("utf-8"),
                                 headers={**UA, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def q(v):
    return urllib.parse.quote(json.dumps(v, separators=(",", ":")))


def file_hash(fp, algo):
    h = hashlib.new(algo)
    with open(fp, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def norm(s):
    return re.sub(r"[\s_\-]", "", s.lower())


def jar_meta(fp):
    """Modrinthに無いjarのために、jarの中のメタ情報から名前とバージョンを読む"""
    try:
        with zipfile.ZipFile(fp) as z:
            names = set(z.namelist())
            for n in ("fabric.mod.json", "quilt.mod.json"):
                if n in names:
                    d = json.loads(z.read(n).decode("utf-8-sig"))
                    if n == "quilt.mod.json":
                        d = d.get("quilt_loader", {})
                        title = (d.get("metadata") or {}).get("name") or d.get("id")
                    else:
                        title = d.get("name") or d.get("id")
                    ver = str(d.get("version", ""))
                    return {"title": title, "version": "" if ver.startswith("${") else ver}
            for n in ("META-INF/neoforge.mods.toml", "META-INF/mods.toml"):
                if n in names:
                    s = z.read(n).decode("utf-8", "ignore")
                    t = re.search(r'displayName\s*=\s*"([^"]+)"', s)
                    v = re.search(r'^\s*version\s*=\s*"([^"]+)"', s, re.M)
                    ver = v.group(1) if v else ""
                    if not ver or ver.startswith("${"):
                        ver = ""
                        if "META-INF/MANIFEST.MF" in names:
                            m = re.search(r"Implementation-Version:\s*(\S+)",
                                          z.read("META-INF/MANIFEST.MF").decode("utf-8", "ignore"))
                            ver = m.group(1) if m else ""
                    return {"title": t.group(1) if t else None, "version": ver}
    except Exception:
        pass
    return {}


class Api:
    # ---------- 設定 ----------
    def _load(self):
        try:
            with open(CFG, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def _save(self, cfg):
        os.makedirs(CFG_DIR, exist_ok=True)
        with open(CFG, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)

    # ---------- セットの保存先 ----------
    def _presets_file(self, cfg):
        return os.path.join(cfg.get("presets_dir") or CFG_DIR, "presets.json")

    def _read_presets(self, cfg):
        try:
            with open(self._presets_file(cfg), encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def _write_presets(self, cfg, p):
        fp = self._presets_file(cfg)
        os.makedirs(os.path.dirname(fp), exist_ok=True)
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(p, f, ensure_ascii=False, indent=2)

    def _load_presets(self, cfg):
        p = self._read_presets(cfg)
        if p is None:
            # 以前は config.json の中に入れていたので、あれば presets.json へ引っ越す
            p = cfg.get("presets") or {}
            if p:
                try:
                    self._write_presets(cfg, p)
                except Exception:
                    return p
        if "presets" in cfg:
            cfg.pop("presets")
            self._save(cfg)
        return p

    def init(self):
        cfg = self._load()
        cfg.setdefault("path", os.path.join(os.environ.get("APPDATA", ""), ".minecraft", "mods"))
        cfg.setdefault("version", "1.20.1")
        cfg.setdefault("loader", "fabric")
        cfg.setdefault("theme", "system")
        presets = self._load_presets(cfg)
        cfg["presets"] = presets
        cfg["presets_file"] = self._presets_file(cfg)
        return cfg

    def set_presets_dir(self, path):
        cfg = self._load()
        old = self._load_presets(cfg)
        new_cfg = dict(cfg)
        new_cfg["presets_dir"] = path
        try:
            existing = self._read_presets(new_cfg) or {}
            merged = {**existing, **old}
            self._write_presets(new_cfg, merged)
        except Exception as e:
            return {"error": str(e)}
        cfg["presets_dir"] = path
        self._save(cfg)
        return {"presets": merged, "file": self._presets_file(cfg)}

    def save_preset(self, name, mods, version, loader):
        cfg = self._load()
        p = self._load_presets(cfg)
        p[name] = {"mods": mods, "version": version, "loader": loader}
        self._write_presets(cfg, p)
        return p

    def delete_preset(self, name):
        cfg = self._load()
        p = self._load_presets(cfg)
        p.pop(name, None)
        self._write_presets(cfg, p)
        return p

    def set_theme(self, theme):
        cfg = self._load()
        cfg["theme"] = theme
        self._save(cfg)

    def remember(self, path, version, loader):
        cfg = self._load()
        cfg.update(path=path, version=version, loader=loader)
        self._save(cfg)

    # ---------- 画面まわり ----------
    def game_versions(self):
        try:
            return [v["version"] for v in get_json("/tag/game_version") if v["version_type"] == "release"]
        except Exception:
            return []

    def pick_folder(self):
        kind = getattr(getattr(webview, "FileDialog", None), "FOLDER", None) or webview.FOLDER_DIALOG
        r = webview.windows[0].create_file_dialog(kind)
        return r[0] if r else None

    def paste(self):
        try:
            import tkinter
            root = tkinter.Tk()
            root.withdraw()
            try:
                return root.clipboard_get()
            finally:
                root.destroy()
        except Exception:
            return ""

    def open_link(self, key):
        links = {
            "fabric": "https://fabricmc.net/use/installer/",
            "forge": "https://files.minecraftforge.net/",
            "neoforge": "https://neoforged.net/",
            "quilt": "https://quiltmc.org/en/install/",
        }
        if key in links:
            webbrowser.open(links[key])

    def open_project(self, slug):
        webbrowser.open("https://modrinth.com/mod/" + urllib.parse.quote(slug))

    # ---------- Modrinth ----------
    def search(self, query, version, loader):
        facets = [["project_type:mod"], ["versions:" + version], ["categories:" + loader]]
        try:
            r = get_json(f"/search?query={urllib.parse.quote(query)}&facets={q(facets)}&limit=15")
            return [{"slug": h["slug"], "title": h["title"], "desc": h["description"], "icon": h.get("icon_url")} for h in r["hits"]]
        except Exception as e:
            return {"error": str(e)}

    def resolve(self, text, version, loader):
        """1行ぶんのテキスト(MOD名 or ModrinthのURL)から、いちばん合うMODを1つ選ぶ"""
        t = text.strip()
        m = re.search(r"modrinth\.com/[a-z]+/([^/?#\s]+)", t)
        if m:
            t = m.group(1)
        facets = [["project_type:mod"], ["versions:" + version], ["categories:" + loader]]
        try:
            hits = get_json(f"/search?query={urllib.parse.quote(t)}&facets={q(facets)}&limit=10")["hits"]
        except Exception as e:
            return {"error": str(e)}
        if not hits:
            return {"line": text, "slug": None}
        key = norm(t)
        best = next((h for h in hits if norm(h["slug"]) == key or norm(h["title"]) == key), None)
        exact = best is not None
        best = best or hits[0]
        return {"line": text, "slug": best["slug"], "title": best["title"], "icon": best.get("icon_url"), "exact": exact}

    def projects_info(self, slugs):
        out = []
        try:
            for i in range(0, len(slugs), 40):
                for p in get_json("/projects?ids=" + q(slugs[i:i + 40])):
                    out.append({"slug": p["slug"], "title": p["title"], "desc": p["description"],
                                "icon": p.get("icon_url"), "downloads": p["downloads"]})
            return out
        except Exception as e:
            return {"error": str(e)}

    def detail(self, slug, version, loader):
        s = urllib.parse.quote(slug)
        try:
            p = get_json("/project/" + s)
            vs = get_json(f"/project/{s}/version?loaders={q([loader])}&game_versions={q([version])}")
            deps = []
            if vs:
                v = next((x for x in vs if x["version_type"] == "release"), vs[0])
                ids = [d["project_id"] for d in v.get("dependencies", [])
                       if d.get("dependency_type") == "required" and d.get("project_id")]
                if ids:
                    deps = [x["title"] for x in get_json("/projects?ids=" + q(ids))]
            return {"slug": p["slug"], "title": p["title"], "desc": p["description"], "icon": p.get("icon_url"),
                    "downloads": p["downloads"], "client": p["client_side"], "server": p["server_side"],
                    "license": (p.get("license") or {}).get("name", ""),
                    "gallery": [g["url"] for g in p.get("gallery", [])[:4]],
                    "deps": deps, "supported": bool(vs)}
        except Exception as e:
            return {"error": str(e)}

    # ---------- 導入済みのjar ----------
    def list_installed(self, path):
        try:
            names = sorted((n for n in os.listdir(path) if n.lower().endswith(".jar")), key=str.lower)
        except Exception as e:
            return {"error": str(e)}
        items = []
        for n in names:
            fp = os.path.join(path, n)
            try:
                st = os.stat(fp)
                sha1 = file_hash(fp, "sha1")
            except Exception:
                continue
            items.append({"name": n, "size": st.st_size, "mtime": st.st_mtime, "sha1": sha1,
                          "slug": None, "title": None, "icon": None, "version": ""})
        offline = False
        known, projs = {}, {}
        if items:
            try:
                known = post_json("/version_files", {"hashes": [i["sha1"] for i in items], "algorithm": "sha1"})
                ids = sorted({v["project_id"] for v in known.values()})
                for i in range(0, len(ids), 40):
                    for p in get_json("/projects?ids=" + q(ids[i:i + 40])):
                        projs[p["id"]] = p
            except Exception:
                offline = True
        for it in items:
            v = known.get(it["sha1"])
            p = projs.get(v["project_id"]) if v else None
            if v and p:
                it.update(slug=p["slug"], title=p["title"], icon=p.get("icon_url"), version=v.get("version_number", ""))
            else:
                meta = jar_meta(os.path.join(path, it["name"]))
                it.update(title=meta.get("title"), version=meta.get("version", ""))
            del it["sha1"]
        return {"items": items, "offline": offline}

    # ---------- 導入 ----------
    def install(self, slugs, version, loader, path):
        log = []
        os.makedirs(path, exist_ok=True)
        queue, seen = list(slugs), set()
        while queue:
            pid = queue.pop(0)
            if pid in seen:
                continue
            seen.add(pid)
            try:
                vs = get_json(f"/project/{pid}/version?loaders={q([loader])}&game_versions={q([version])}")
            except Exception as e:
                log.append(f"✗ {pid}: 情報の取得に失敗 ({e})")
                continue
            if not vs:
                log.append(f"✗ {pid}: {version} / {loader} に対応する版がありません")
                continue
            v = next((x for x in vs if x["version_type"] == "release"), vs[0])
            f = next((x for x in v["files"] if x.get("primary")), v["files"][0])
            dest = os.path.join(path, f["filename"])
            try:
                have = os.path.exists(dest) and file_hash(dest, "sha512") == f["hashes"]["sha512"]
            except Exception:
                have = False
            if have:
                log.append(f"－ {f['filename']}: すでに入っています")
            else:
                try:
                    req = urllib.request.Request(f["url"], headers=UA)
                    with urllib.request.urlopen(req, timeout=60) as r:
                        data = r.read()
                    if hashlib.sha512(data).hexdigest() != f["hashes"]["sha512"]:
                        log.append(f"✗ {f['filename']}: ファイルが壊れていました。もう一度試してください")
                        continue
                    with open(dest, "wb") as out:
                        out.write(data)
                    log.append(f"✓ {f['filename']}")
                except Exception as e:
                    log.append(f"✗ {f['filename']}: ダウンロード失敗 ({e})")
                    continue
            for d in v.get("dependencies", []):
                if d.get("dependency_type") == "required" and d.get("project_id"):
                    queue.append(d["project_id"])
        return log


if __name__ == "__main__":
    webview.create_window("かんたんMODインストーラー", os.path.join(base(), "index.html"),
                          js_api=Api(), width=960, height=740, min_size=(720, 560))
    webview.start()
