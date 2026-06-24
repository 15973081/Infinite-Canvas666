import os
import re
import json
import time
import shutil
import logging
import urllib.request
import urllib.error
import urllib.parse
import subprocess
from typing import List, Dict, Any, Optional, Tuple

import requests
from fastapi.responses import Response

from app.config import (
    BASE_DIR, STATIC_DIR, DATA_DIR,
    APP_VERSION,
    GITHUB_REPO_URL, GITHUB_VERSION_URL, GITHUB_TREE_URL,
    GITHUB_RAW_ROOT, GITHUB_UPDATE_NOTES_URL,
    MODELSCOPE_REPO_URL, MODELSCOPE_RAW_ROOT,
    MODELSCOPE_FILE_API_ROOT, MODELSCOPE_VERSION_URL,
    MODELSCOPE_UPDATE_NOTES_URL, MODELSCOPE_TREE_URL,
    UPDATE_SOURCE_LABELS,
)


def current_app_version():
    version_file = os.path.join(BASE_DIR, "VERSION")
    try:
        if os.path.exists(version_file):
            with open(version_file, "r", encoding="utf-8") as f:
                version = (f.read().strip().splitlines() or [""])[0].strip()
                if version:
                    return version
    except Exception:
        pass
    try:
        return time.strftime("%Y.%m.%d", time.localtime())
    except Exception:
        return ""


def update_notes_path() -> str:
    return os.path.join(STATIC_DIR, "update-notes.json")


def safe_update_notes(payload: Any, version: str = "") -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    items = payload.get("items")
    if not isinstance(items, list):
        items = []
    clean_items = []
    for item in items[:30]:
        if isinstance(item, dict):
            text = str(item.get("text") or item.get("title") or "").strip()
            if not text:
                continue
            clean_items.append({
                "type": str(item.get("type") or "update").strip()[:32],
                "text": text[:500],
            })
        else:
            text = str(item or "").strip()
            if text:
                clean_items.append({"type": "update", "text": text[:500]})
    notes_version = str(payload.get("version") or version or "").strip()
    history = payload.get("history")
    selected_history = {}
    if version and isinstance(history, list):
        for entry in history:
            if isinstance(entry, dict) and str(entry.get("version") or "").strip() == version:
                selected_history = safe_update_notes(entry, version)
                break
    if selected_history:
        return selected_history
    return {
        "version": notes_version,
        "updated_at": str(payload.get("updated_at") or payload.get("date") or "").strip(),
        "items": clean_items,
    }


def read_local_update_notes(version: str = "") -> Dict[str, Any]:
    try:
        path = update_notes_path()
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return safe_update_notes(json.load(f), version)
    except Exception:
        pass
    return {"version": version or current_app_version(), "updated_at": "", "items": []}


def fetch_remote_update_notes(url: str, version: str = "", timeout: float = 5.0) -> Dict[str, Any]:
    info: Dict[str, Any] = {"ok": False, "error": "", "url": url, "version": version, "items": []}
    if not url:
        info["error"] = "missing url"
        return info
    try:
        resp = requests.get(
            f"{url}{'&' if '?' in url else '?'}t={int(time.time())}",
            headers={"User-Agent": "Infinite-Canvas-Updater"},
            timeout=timeout,
            proxies=urllib.request.getproxies() or None,
        )
        if 200 <= resp.status_code < 400:
            payload = json.loads(resp.content.decode("utf-8", errors="replace"))
            notes = safe_update_notes(payload, version)
            info.update(notes)
            info["ok"] = True
        else:
            info["error"] = f"HTTP {resp.status_code}"
    except Exception as exc:
        info["error"] = str(exc)
    return info


def fetch_update_notes_with_fallback(preferred_source: str, version: str, timeout: float = 3.0) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    urls = {
        "github": GITHUB_UPDATE_NOTES_URL,
        "modelscope": MODELSCOPE_UPDATE_NOTES_URL,
    }
    preferred = preferred_source if preferred_source in urls else "github"
    order = [preferred, "modelscope" if preferred == "github" else "github"]
    notes_by_source: Dict[str, Any] = {}
    best_notes: Dict[str, Any] = {"version": version, "items": []}
    for source in order:
        notes = fetch_remote_update_notes(urls[source], version, timeout=timeout)
        notes["source"] = source
        notes_by_source[source] = notes
        if notes.get("ok") and (notes.get("items") or []):
            best_notes = notes
            break
    for source, url in urls.items():
        if source not in notes_by_source:
            notes_by_source[source] = {
                "ok": False,
                "error": "未尝试：已有更新说明可用" if best_notes.get("items") else "未尝试",
                "url": url,
                "source": source,
                "version": version,
                "items": [],
            }
    return best_notes, notes_by_source


def versioned_static_html(html: str) -> str:
    version = current_app_version()
    if not version:
        return html
    safe_version = urllib.parse.quote(version, safe="._-")
    pattern = re.compile(r'(?P<prefix>(?:src|href)=["\']|@import\s+url\(["\'])(?P<url>/static/[^"\')?#]+(?:\.(?:js|css|html)))(?:\?v=[^"\')#]*)?', re.I)
    def replace(match):
        url = match.group("url")
        cache_version = safe_version
        try:
            rel = urllib.parse.unquote(url[len("/static/"):]).replace("/", os.sep)
            path = os.path.abspath(os.path.join(STATIC_DIR, rel))
            static_root = os.path.abspath(STATIC_DIR)
            if path.startswith(static_root + os.sep) and os.path.isfile(path):
                cache_version = f"{safe_version}.{int(os.path.getmtime(path))}"
        except Exception:
            pass
        return f"{match.group('prefix')}{url}?v={cache_version}"
    return pattern.sub(replace, html)


def sync_static_html_versions():
    version = current_app_version()
    if not version:
        return
    safe_version = urllib.parse.quote(version, safe="._-")
    try:
        for name in os.listdir(STATIC_DIR):
            # 跳过 macOS 在外置硬盘(ExFAT/NTFS)生成的 ._* Apple Double 元数据文件，
            # 这些是二进制文件，按 UTF-8 读取会抛 UnicodeDecodeError。
            if name.startswith("._"):
                continue
            if not name.lower().endswith(".html"):
                continue
            path = os.path.join(STATIC_DIR, name)
            if not os.path.isfile(path):
                continue
            # 单文件容错：某个文件读写失败不应中断整批同步。
            try:
                with open(path, "r", encoding="utf-8") as f:
                    old = f.read()
                new = versioned_static_html(re.sub(r'([?&]v=)[^"\'`\s<>)]*', rf'\g<1>{safe_version}', old))
                if new != old:
                    with open(path, "w", encoding="utf-8", newline="") as f:
                        f.write(new)
            except Exception as e:
                print(f"同步静态页面版本号失败({name}): {e}")
    except Exception as e:
        print(f"同步静态页面版本号失败: {e}")


def static_html_response(filename: str):
    path = os.path.join(STATIC_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    return Response(
        versioned_static_html(html),
        media_type="text/html; charset=utf-8",
        headers={"Cache-Control": "no-cache"},
    )


STATIC_PROMPT_TEMPLATE_MD = os.path.join(STATIC_DIR, "system-prompts", "infinite-canvas-prompt-templates.md")
PROMPT_TEMPLATE_PATHS = [STATIC_PROMPT_TEMPLATE_MD]
PROMPT_TEMPLATE_EN = {
    "多机位九宫格": {
        "name": "9-Angle Multi-Camera Grid",
        "scene": "Show the same subject or scene from 9 camera angles for character turnarounds, product views, or space scouting.",
    },
    "多机位九宫格4K": {
        "name": "9-Angle Multi-Camera Grid 4K",
        "scene": "A high-resolution 9-angle reference sheet for print-grade output, large displays, and fine material study.",
    },
    "剧情推演四宫格": {
        "name": "4-Panel Story Progression",
        "scene": "Preview four consecutive story beats or emotional stages for storyboard planning and narrative rhythm tests.",
    },
    "角色脸部三视图": {
        "name": "Character Face 3-View Sheet",
        "scene": "Front, side, and three-quarter face references for Actor ID locking and expression consistency.",
    },
    "产品三视图": {
        "name": "Product 3-View Sheet",
        "scene": "Front, side, and top product views for industrial design, ecommerce detail pages, and technical documents.",
    },
    "25宫格连贯分镜": {
        "name": "25-Panel Continuous Storyboard",
        "scene": "A full 5x5 storyboard for continuous scene or action flow, useful for film previews and motion continuity tests.",
    },
    "电影级光影校正": {
        "name": "Cinematic Lighting Comparison",
        "scene": "Compare the same subject or scene under different lighting conditions for mood, color, and lighting choices.",
    },
    "角色设定参考表（胸口特写+全身三视图）": {
        "name": "Character Reference Sheet: Portrait + Full-Body Views",
        "scene": "A consistency reference combining a face anchor and full-body front, side, and back views for Actor ID and costume lock.",
    },
    "6种基础表情胸像（2×3六宫格）": {
        "name": "6 Basic Expression Busts",
        "scene": "Six basic expressions of the same character for expression consistency, emotion baselines, and Seedance Talk-to-Edit reference.",
    },
    "360全景图": {
        "name": "360 Panorama VR Image",
        "scene": "Generate a seamless 360-degree VR panorama with continuous left and right edges and natural pole transitions.",
    },
}


def prompt_template_markdown_path() -> str:
    for path in PROMPT_TEMPLATE_PATHS:
        if os.path.exists(path):
            return path
    return ""


def prompt_template_category(name: str, scene: str) -> str:
    text = f"{name} {scene}"
    if any(k in text for k in ["光影", "灯光", "光效", "电影级"]):
        return "lighting"
    if any(k in text for k in ["视角", "全景", "VR", "镜头", "俯拍", "仰拍", "景别", "构图", "透视"]):
        return "view"
    if any(k in text for k in ["角色", "脸部", "表情", "Actor", "服装"]):
        return "character"
    if any(k in name for k in ["产品", "电商", "工业"]):
        return "product"
    return "storyboard"


def extract_prompt_template_section(block: str, title: str) -> str:
    pattern = rf"###\s*{re.escape(title)}\s*\n(?P<body>.*?)(?=\n###\s+|\Z)"
    match = re.search(pattern, block, re.S)
    if not match:
        return ""
    body = match.group("body").strip()
    fence = re.search(r"```(?:\w+)?\s*\n(?P<code>.*?)\n```", body, re.S)
    return (fence.group("code") if fence else body).strip()


def parse_prompt_template_markdown(text: str):
    templates = []
    matches = list(re.finditer(r"^##\s*预设\s*(\d+)\s*[：:]\s*(.+?)\s*$", text, re.M))
    for index, match in enumerate(matches):
        number = match.group(1).strip()
        name = match.group(2).strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[start:end]
        scene = extract_prompt_template_section(block, "适用场景")
        positive = extract_prompt_template_section(block, "正向提示词")
        negative = extract_prompt_template_section(block, "负向提示词")
        params_raw = extract_prompt_template_section(block, "平台参数建议")
        params = {}
        for line in params_raw.splitlines():
            item = re.match(r"[-*]\s*\*\*(.+?)\*\*\s*[：:]\s*(.+)", line.strip())
            if item:
                params[item.group(1).strip()] = item.group(2).strip()
        if not positive:
            continue
        templates.append({
            "id": f"builtin_md_{number}",
            "number": number,
            "name": name,
            "name_en": PROMPT_TEMPLATE_EN.get(name, {}).get("name", name),
            "category": prompt_template_category(name, scene),
            "scene": scene,
            "scene_en": PROMPT_TEMPLATE_EN.get(name, {}).get("scene", scene),
            "positive": positive,
            "negative": negative,
            "params": params,
            "builtin": True,
        })
    return templates


def connectivity_probe(name: str, url: str, timeout: float = 5.0) -> Dict[str, Any]:
    started = time.time()
    item = {
        "name": name,
        "url": url,
        "ok": False,
        "status": 0,
        "elapsed_ms": 0,
        "error": "",
        "timed_out": False,
    }
    try:
        response = requests.get(
            url,
            headers={"User-Agent": "Infinite-Canvas-Updater"},
            timeout=timeout,
            stream=True,
            proxies=urllib.request.getproxies() or None,
        )
        item["status"] = response.status_code
        item["ok"] = 200 <= response.status_code < 400
        if not item["ok"]:
            item["error"] = f"HTTP {response.status_code} {response.reason}"
        response.close()
    except requests.Timeout:
        item["timed_out"] = True
        item["error"] = f"连接超时（超过 {timeout:g}s）"
    except requests.RequestException as exc:
        item["error"] = str(exc)
    finally:
        item["elapsed_ms"] = int((time.time() - started) * 1000)
    return item


def update_connectivity_targets() -> List[Tuple[str, str, str, bool]]:
    return [
        ("GitHub 更新列表", GITHUB_TREE_URL, "github", True),
        ("GitHub 版本文件", GITHUB_VERSION_URL, "github", True),
        ("GitHub 主页", "https://github.com/", "github", False),
        ("ModelScope 版本文件", MODELSCOPE_VERSION_URL, "modelscope", True),
        ("ModelScope 空间页面", MODELSCOPE_REPO_URL, "modelscope", False),
        ("ModelScope 主页", "https://modelscope.cn/", "modelscope", False),
        ("Google 连通性", "https://www.google.com/generate_204", "reference", False),
    ]


def fetch_remote_version(url: str, timeout: float = 5.0) -> Dict[str, Any]:
    info: Dict[str, Any] = {"version": "", "ok": False, "error": "", "url": url}
    if not url:
        info["error"] = "missing url"
        return info
    try:
        resp = requests.get(
            f"{url}{'&' if '?' in url else '?'}t={int(time.time())}",
            headers={"User-Agent": "Infinite-Canvas-Updater"},
            timeout=timeout,
            proxies=urllib.request.getproxies() or None,
        )
        if 200 <= resp.status_code < 400:
            text = resp.content.decode("utf-8", errors="replace").strip()
            version = text.splitlines()[0].strip() if text else ""
            # 防御：raw 网页/错误页会返回 HTML 或 JSON，必须长得像版本号（含数字、无尖括号/花括号）
            if version and "<" not in version and "{" not in version and re.search(r"\d", version):
                info["version"] = version
                info["ok"] = True
            elif not version:
                info["error"] = "空版本文件"
            else:
                info["error"] = "版本文件格式异常"
        else:
            info["error"] = f"HTTP {resp.status_code}"
    except requests.RequestException as exc:
        info["error"] = str(exc)
    return info


def update_allowed_file(path: str) -> bool:
    path = str(path or "").replace("\\", "/").lstrip("/")
    if not path or any(part in {"", ".", ".."} for part in path.split("/")):
        return False
    return path in {"main.py", "VERSION"} or path.startswith("static/")


GITHUB_TREE_CACHE: Dict[str, Any] = {"etag": "", "data": None, "expires_at": 0.0}


def github_get(url: str, headers: Optional[Dict[str, str]] = None, timeout: int = 30) -> requests.Response:
    try:
        response = requests.get(
            url,
            headers=headers or {},
            timeout=timeout,
            proxies=urllib.request.getproxies() or None,
        )
    except requests.RequestException as exc:
        raise urllib.error.URLError(str(exc)) from exc
    if response.status_code >= 400 or response.status_code == 304:
        raise urllib.error.HTTPError(url, response.status_code, response.reason, response.headers, None)
    return response


def github_json(url: str, use_etag_cache: bool = False):
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "Infinite-Canvas-Updater",
    }
    cache_key = url
    if use_etag_cache and cache_key == GITHUB_TREE_URL:
        if GITHUB_TREE_CACHE["data"] and time.time() < GITHUB_TREE_CACHE["expires_at"]:
            return GITHUB_TREE_CACHE["data"]
        if GITHUB_TREE_CACHE["etag"]:
            headers["If-None-Match"] = GITHUB_TREE_CACHE["etag"]
    try:
        resp = github_get(url, headers=headers, timeout=30)
        etag = resp.headers.get("ETag", "")
        payload = json.loads(resp.content.decode("utf-8", errors="replace"))
        if use_etag_cache and cache_key == GITHUB_TREE_URL:
            GITHUB_TREE_CACHE.update({
                "etag": etag,
                "data": payload,
                "expires_at": time.time() + 600,  # 10 分钟内复用
            })
        return payload
    except urllib.error.HTTPError as exc:
        # 304 表示对方树未变，沿用缓存
        if exc.code == 304 and use_etag_cache and GITHUB_TREE_CACHE["data"]:
            GITHUB_TREE_CACHE["expires_at"] = time.time() + 600
            return GITHUB_TREE_CACHE["data"]
        raise


def github_bytes(url: str) -> bytes:
    resp = github_get(url, headers={"User-Agent": "Infinite-Canvas-Updater"}, timeout=60)
    return resp.content


def download_github_update_files(files: List[str], staging_root: str) -> None:
    staging_root_abs = os.path.abspath(staging_root)
    for rel in files:
        safe_update_target(rel)
        raw_url = f"{GITHUB_RAW_ROOT}/{urllib.parse.quote(rel, safe='/')}"
        data = github_bytes(raw_url)
        stage_path = os.path.abspath(os.path.join(staging_root_abs, *rel.split("/")))
        if os.path.commonpath([staging_root_abs, stage_path]) != staging_root_abs:
            raise ValueError(f"更新暂存路径不安全：{rel}")
        os.makedirs(os.path.dirname(stage_path), exist_ok=True)
        with open(stage_path, "wb") as f:
            f.write(data)


def modelscope_update_file_list() -> List[str]:
    """通过 ModelScope 仓库文件 API 列出所有允许更新的文件（不依赖 git）。"""
    resp = github_get(MODELSCOPE_TREE_URL, headers={"User-Agent": "Infinite-Canvas-Updater"}, timeout=30)
    payload = json.loads(resp.content.decode("utf-8", errors="replace"))
    files_node = ((payload.get("Data") or {}).get("Files")) or []
    out: List[str] = []
    for entry in files_node:
        if not isinstance(entry, dict):
            continue
        if entry.get("Type") != "blob":
            continue
        path = str(entry.get("Path") or "").replace("\\", "/")
        if update_allowed_file(path):
            out.append(path)
    return sorted(set(out))


def modelscope_file_bytes(rel: str) -> bytes:
    url = MODELSCOPE_FILE_API_ROOT + urllib.parse.quote(rel, safe="/")
    resp = github_get(url, headers={"User-Agent": "Infinite-Canvas-Updater"}, timeout=60)
    return resp.content


def download_modelscope_update_files(staging_root: str) -> List[str]:
    # 用 HTTP 仓库文件 API 下载（与 GitHub raw 同样思路），不依赖本机安装 Git。
    # 之前用 git clone 会要求目标机装 Git for Windows，很多用户没装 → 一键更新失败。
    files = modelscope_update_file_list()
    if not files:
        raise RuntimeError("ModelScope 未返回任何文件")
    if "main.py" not in files or "VERSION" not in files:
        raise RuntimeError("ModelScope 更新源缺少 main.py 或 VERSION")
    if not any(f.startswith("static/") for f in files):
        raise RuntimeError("ModelScope 未返回 static 文件，已取消更新")
    staging_root_abs = os.path.abspath(staging_root)
    for rel in files:
        safe_update_target(rel)
        data = modelscope_file_bytes(rel)
        stage_path = os.path.abspath(os.path.join(staging_root_abs, *rel.split("/")))
        if os.path.commonpath([staging_root_abs, stage_path]) != staging_root_abs:
            raise ValueError(f"更新暂存路径不安全：{rel}")
        os.makedirs(os.path.dirname(stage_path), exist_ok=True)
        with open(stage_path, "wb") as f:
            f.write(data)
    return files


def safe_update_target(path: str) -> str:
    rel = str(path or "").replace("\\", "/").lstrip("/")
    if not update_allowed_file(rel):
        raise ValueError(f"更新文件不在允许范围：{rel}")
    target = os.path.abspath(os.path.join(BASE_DIR, *rel.split("/")))
    base = os.path.abspath(BASE_DIR)
    if os.path.commonpath([base, target]) != base:
        raise ValueError(f"更新路径不安全：{rel}")
    return target


def safe_static_dir() -> str:
    target = os.path.abspath(STATIC_DIR)
    expected = os.path.abspath(os.path.join(BASE_DIR, "static"))
    base = os.path.abspath(BASE_DIR)
    if target != expected or os.path.commonpath([base, target]) != base:
        raise RuntimeError(f"static 路径不安全：{target}")
    return target


def schedule_self_restart(delay_seconds: int = 3) -> bool:
    """派生脱离父进程的小脚本，等几秒后启动启动服务脚本，并干掉当前 PID。"""
    delay = max(1, int(delay_seconds or 3))
    pid = os.getpid()
    try:
        if os.name == "nt":
            launcher = os.path.join(BASE_DIR, "启动服务.bat")
            if not os.path.exists(launcher):
                launcher = os.path.join(BASE_DIR, "start.bat")
            bat_path = os.path.join(BASE_DIR, "_self_restart.bat")
            log_path = os.path.join(BASE_DIR, "_self_restart.log")
            script = (
                "@echo off\r\n"
                "chcp 65001 >nul\r\n"
                "setlocal\r\n"
                f"set \"APP_DIR={BASE_DIR}\"\r\n"
                f"set \"LAUNCHER={launcher}\"\r\n"
                f"set \"LOG_FILE={log_path}\"\r\n"
                "echo [%date% %time%] restart scheduled >> \"%LOG_FILE%\"\r\n"
                f"timeout /t {delay} /nobreak >nul\r\n"
                "echo [%date% %time%] stopping old process >> \"%LOG_FILE%\"\r\n"
                f"taskkill /F /PID {pid} >nul 2>&1\r\n"
                "timeout /t 2 /nobreak >nul\r\n"
                "cd /d \"%APP_DIR%\"\r\n"
                "if exist \"%LAUNCHER%\" (\r\n"
                "  echo [%date% %time%] starting launcher: %LAUNCHER% >> \"%LOG_FILE%\"\r\n"
                "  start \"ComfyUI-API-Modelscope\" /D \"%APP_DIR%\" cmd /k call \"%LAUNCHER%\"\r\n"
                ") else (\r\n"
                "  echo [%date% %time%] launcher missing, fallback to python main.py >> \"%LOG_FILE%\"\r\n"
                "  if exist \"%APP_DIR%\\python\\python.exe\" (\r\n"
                "    start \"ComfyUI-API-Modelscope\" /D \"%APP_DIR%\" cmd /k \"\"%APP_DIR%\\python\\python.exe\" main.py\"\r\n"
                "  ) else (\r\n"
                "    start \"ComfyUI-API-Modelscope\" /D \"%APP_DIR%\" cmd /k python main.py\r\n"
                "  )\r\n"
                ")\r\n"
                "del \"%~f0\"\r\n"
            )
            with open(bat_path, "w", encoding="utf-8") as f:
                f.write(script)
            subprocess.Popen(
                ["cmd", "/c", bat_path],
                creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
                close_fds=True,
            )
        else:
            launcher = os.path.join(BASE_DIR, "mac-启动服务.command")
            if not os.path.exists(launcher):
                launcher = os.path.join(BASE_DIR, "start.sh")
            sh_path = os.path.join(BASE_DIR, "_self_restart.sh")
            script = (
                "#!/bin/sh\n"
                f"sleep {delay}\n"
                f"kill -9 {pid} 2>/dev/null\n"
                f"cd \"{BASE_DIR}\"\n"
                f"if [ -x \"{launcher}\" ]; then nohup \"{launcher}\" >/dev/null 2>&1 &\n"
                f"elif [ -f \"{launcher}\" ]; then nohup /bin/sh \"{launcher}\" >/dev/null 2>&1 &\n"
                "fi\n"
                "rm -- \"$0\"\n"
            )
            with open(sh_path, "w", encoding="utf-8") as f:
                f.write(script)
            os.chmod(sh_path, 0o755)
            subprocess.Popen(
                ["/bin/sh", sh_path],
                start_new_session=True,
                close_fds=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        return True
    except Exception as exc:
        logging.exception("schedule_self_restart failed: %s", exc)
        return False


def github_update_file_list() -> Tuple[List[str], List[str], List[str]]:
    tree_data = github_json(GITHUB_TREE_URL, use_etag_cache=True)
    entries = tree_data.get("tree") or []
    static_files = []
    root_files = []
    for entry in entries:
        path = str(entry.get("path") or "").replace("\\", "/")
        if entry.get("type") == "blob" and update_allowed_file(path):
            if path.startswith("static/"):
                static_files.append(path)
            else:
                root_files.append(path)
    if "main.py" not in root_files:
        root_files.append("main.py")
    if "VERSION" not in root_files:
        root_files.append("VERSION")
    static_files = sorted(set(static_files))
    root_files = sorted(set(root_files))
    files = root_files + static_files
    if not static_files:
        raise RuntimeError("GitHub 未返回 static 文件，已取消更新")
    return root_files, static_files, files


def staged_update_file_list(staging_root: str) -> Tuple[List[str], List[str], List[str]]:
    root_files = []
    static_files = []
    for root_dir, _, names in os.walk(staging_root):
        for name in names:
            path = os.path.abspath(os.path.join(root_dir, name))
            rel = os.path.relpath(path, staging_root).replace("\\", "/")
            if not update_allowed_file(rel):
                continue
            if rel.startswith("static/"):
                static_files.append(rel)
            else:
                root_files.append(rel)
    if "main.py" not in root_files or "VERSION" not in root_files:
        raise RuntimeError("更新源缺少 main.py 或 VERSION")
    if not static_files:
        raise RuntimeError("更新源未返回 static 文件，已取消更新")
    root_files = sorted(set(root_files))
    static_files = sorted(set(static_files))
    return root_files, static_files, root_files + static_files


def normalize_update_source(value: str) -> str:
    source = str(value or "github").strip().lower()
    if source == "ms":
        return "modelscope"
    if source not in {"github", "modelscope"}:
        return "github"
    return source


def stage_update_from_source(source: str, staging_root: str) -> Tuple[List[str], List[str], List[str]]:
    """下载指定源的更新文件到 staging，返回 (root_files, static_files, files)。失败抛异常。"""
    if source == "modelscope":
        download_modelscope_update_files(staging_root)
        return staged_update_file_list(staging_root)
    root_files, static_files, files = github_update_file_list()
    download_github_update_files(files, staging_root)
    return root_files, static_files, files


def list_update_backups() -> List[Dict[str, Any]]:
    root = os.path.join(DATA_DIR, "update_backups")
    if not os.path.isdir(root):
        return []
    items = []
    for name in sorted(os.listdir(root), reverse=True):
        bp = os.path.join(root, name)
        if not os.path.isdir(bp):
            continue
        file_count = 0
        for _, _, fs in os.walk(bp):
            file_count += len(fs)
        try:
            created_at = os.path.getmtime(bp)
        except OSError:
            created_at = 0.0
        items.append({
            "name": name,
            "file_count": file_count,
            "created_at": created_at,
        })
    return items
