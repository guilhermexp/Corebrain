#!/usr/bin/env python3
"""Build deterministic Corebrain release artifacts.

The packager deliberately accepts only the four Obsidian runtime files and the
already-built browser extension directory.  It never walks the source tree when
creating an artifact, so local notes, credentials, profiles, dependencies and
source maps cannot leak into a release by accident.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable, List, Mapping, Optional, Sequence, Tuple
from urllib.parse import unquote, urlsplit

PLUGIN_ID = "clippings-gallery"
PLUGIN_NAME = "Corebrain"
PLUGIN_VERSION = "0.4.0"
EXTENSION_NAME = "corebrain-clipper"
EXTENSION_DISPLAY_NAME = "Corebrain Web Clipper"
EXTENSION_VERSION = "1.8.0"
CANONICAL_HOME = "https://github.com/guilhermexp/Corebrain"
PLUGIN_FILES = ("main.js", "manifest.json", "styles.css", "LICENSE")

# These names are ignored rather than copied when a polluted build directory is
# supplied.  They are listed explicitly to keep the release boundary obvious.
PRIVATE_NAMES = {
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".git",
    "data.json",
    "node_modules",
    "profile",
    "profiles",
}
PRIVATE_SUFFIXES = (".map", ".pem", ".key", ".p12", ".pfx")
RUNTIME_ROOT_FILES = {
    "background.js",
    "browser-polyfill.min.js",
    "content.js",
    "flatten-shadow-dom.js",
    "highlighter.css",
    "highlighter.js",
    "highlights.html",
    "highlights.js",
    "manifest.json",
    "popup.html",
    "popup.js",
    "providers.json",
    "reader-page.js",
    "reader-script.js",
    "reader.css",
    "reader.html",
    "reader.js",
    "settings.html",
    "settings.js",
    "side-panel.html",
    "style.css",
    "style.js",
    "THIRD_PARTY_NOTICES.txt",
}
RUNTIME_IMAGE_SUFFIXES = (".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp")


class PackageError(RuntimeError):
    """Raised when release inputs are missing, invalid or unsafe."""


def _read_json(path: Path) -> Mapping[str, object]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle)
    except FileNotFoundError as exc:
        raise PackageError("missing required JSON file: %s" % path) from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise PackageError("cannot read JSON file %s: %s" % (path, exc)) from exc
    if not isinstance(value, dict):
        raise PackageError("expected a JSON object in %s" % path)
    return value


def _require_file(path: Path, label: str) -> Path:
    if not path.exists():
        raise PackageError("missing required %s: %s" % (label, path))
    if not path.is_file() or path.is_symlink():
        raise PackageError("required %s is not a regular file: %s" % (label, path))
    return path


def _validate_branding(root: Path, extension_manifest: Mapping[str, object]) -> None:
    plugin_manifest = _read_json(root / "manifest.json")
    if plugin_manifest.get("id") != PLUGIN_ID:
        raise PackageError("plugin manifest id must remain %s" % PLUGIN_ID)
    if plugin_manifest.get("name") != PLUGIN_NAME:
        raise PackageError("plugin manifest name must be %s" % PLUGIN_NAME)
    if plugin_manifest.get("version") != PLUGIN_VERSION:
        raise PackageError("plugin manifest version must be %s" % PLUGIN_VERSION)

    versions = _read_json(root / "versions.json")
    if PLUGIN_VERSION not in versions:
        raise PackageError("versions.json has no entry for plugin %s" % PLUGIN_VERSION)

    package = _read_json(root / "extension" / "package.json")
    if package.get("name") != EXTENSION_NAME:
        raise PackageError("extension package name must be %s" % EXTENSION_NAME)
    if package.get("version") != EXTENSION_VERSION:
        raise PackageError("extension package version must be %s" % EXTENSION_VERSION)

    if extension_manifest.get("name") != EXTENSION_DISPLAY_NAME:
        raise PackageError(
            "built extension manifest name must be %s" % EXTENSION_DISPLAY_NAME
        )
    if extension_manifest.get("version") != EXTENSION_VERSION:
        raise PackageError(
            "built extension manifest version must be %s" % EXTENSION_VERSION
        )
    homepage = extension_manifest.get("homepage_url")
    if homepage and homepage != CANONICAL_HOME:
        raise PackageError("extension homepage_url must point to %s" % CANONICAL_HOME)


def _plugin_files(root: Path) -> List[Tuple[str, Path]]:
    files: List[Tuple[str, Path]] = []
    for name in PLUGIN_FILES:
        path = _require_file(root / name, "plugin runtime asset")
        files.append(("clippings-gallery/" + name, path))
    return files


def _safe_archive_name(relative: Path) -> str:
    # Use POSIX separators independently of the host OS.
    value = relative.as_posix()
    if not value or value.startswith("/") or "\x00" in value:
        raise PackageError("unsafe extension asset path: %s" % value)
    parts = value.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise PackageError("unsafe extension asset path: %s" % value)
    return value


def _is_private_path(relative: Path) -> bool:
    if any(part in PRIVATE_NAMES for part in relative.parts):
        return True
    if any(part.startswith(".") for part in relative.parts):
        return True
    return relative.name in PRIVATE_NAMES or any(
        relative.name.endswith(suffix) for suffix in PRIVATE_SUFFIXES
    )


def _is_runtime_asset(relative: Path) -> bool:
    """Return whether a built path is a known WebExtension runtime asset."""
    if _is_private_path(relative):
        return False
    parts = relative.parts
    if len(parts) == 1:
        if relative.name in {"LICENSE"} or relative.name.endswith(".LICENSE.txt"):
            return True
        return relative.name in RUNTIME_ROOT_FILES
    if parts[0] == "_locales" and len(parts) == 3:
        return parts[2] == "messages.json" and not parts[1].startswith(".")
    if parts[0] == "icons" and len(parts) == 2:
        return relative.name.lower().endswith(RUNTIME_IMAGE_SUFFIXES)
    return False


def _package_root(
    extension_root: Path, parent_root: Path, package_name: str
) -> Optional[Path]:
    """Resolve an installed package using Node's upward lookup semantics."""
    current = parent_root
    candidates: List[Path] = []
    while True:
        candidates.append(current / "node_modules" / package_name)
        if current == extension_root or current.parent == current:
            break
        current = current.parent
    candidates.append(extension_root / "node_modules" / package_name)
    for candidate in candidates:
        manifest = candidate / "package.json"
        if candidate.is_dir() and manifest.is_file() and not candidate.is_symlink():
            return candidate
    return None


def _production_packages(extension_root: Path) -> List[Tuple[Path, Mapping[str, object]]]:
    """Return the installed production dependency closure in stable order."""
    root_manifest = _read_json(extension_root / "package.json")
    seeds: List[str] = []
    dependencies = root_manifest.get("dependencies")
    if isinstance(dependencies, dict):
        seeds.extend(str(name) for name in dependencies)
    # This package is copied into every extension build and is a runtime
    # dependency even when a small fixture omits it from package.json.
    if "webextension-polyfill" not in seeds:
        seeds.append("webextension-polyfill")

    queue: List[Tuple[Path, str]] = [(extension_root, name) for name in seeds]
    visited = set()
    packages: List[Tuple[Path, Mapping[str, object]]] = []
    while queue:
        parent_root, package_name = queue.pop(0)
        package_root = _package_root(extension_root, parent_root, package_name)
        if package_root is None:
            continue
        package_key = str(package_root.resolve())
        if package_key in visited:
            continue
        visited.add(package_key)
        manifest = _read_json(package_root / "package.json")
        packages.append((package_root, manifest))
        for field in ("dependencies", "optionalDependencies", "peerDependencies"):
            nested = manifest.get(field)
            if isinstance(nested, dict):
                queue.extend((package_root, str(name)) for name in nested)
    return sorted(
        packages,
        key=lambda item: (
            str(item[1].get("name", item[0].name)),
            str(item[1].get("version", "")),
            str(item[0].relative_to(extension_root)),
        ),
    )


def _license_files(package_root: Path) -> List[Path]:
    candidates: List[Path] = []
    for path in sorted(package_root.iterdir(), key=lambda item: (item.name.lower(), item.name)):
        if not path.is_file() or path.is_symlink():
            continue
        lower = path.name.lower()
        if (
            lower == "license"
            or lower.startswith("license.")
            or lower.startswith("license-")
            or lower == "copying"
            or lower.startswith("copying.")
            or lower == "notice"
            or lower.startswith("notice.")
        ):
            candidates.append(path)
    return candidates


def _read_notice_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_bytes().decode("latin-1")


def _write_third_party_notices(extension_root: Path, destination: Path) -> Optional[Path]:
    """Write full installed production license texts for downloadable builds."""
    packages = _production_packages(extension_root)
    if not packages:
        return None
    lines = [
        "Corebrain Web Clipper third-party notices",
        "===========================================",
        "Generated from the installed production dependency manifests.",
        "",
    ]
    for package_root, manifest in packages:
        name = str(manifest.get("name", package_root.name))
        version = str(manifest.get("version", "unknown"))
        license_value = manifest.get("license", "not declared")
        if isinstance(license_value, (dict, list)):
            license_value = json.dumps(license_value, sort_keys=True)
        lines.extend(["Package: %s@%s" % (name, version), "License: %s" % license_value, ""])
        files = _license_files(package_root)
        if files:
            for license_path in files:
                lines.extend(["--- %s ---" % license_path.name, _read_notice_text(license_path).rstrip(), ""])
        else:
            lines.extend(["No license file was present in the installed package.", ""])
    destination.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    destination.chmod(0o644)
    return destination


def _extension_files(
    dist: Path, replacement_notice: Optional[Path] = None
) -> Tuple[List[Tuple[str, Path]], Mapping[str, object]]:
    if not dist.is_dir() or dist.is_symlink():
        raise PackageError("missing built extension directory: %s" % dist)

    manifest_path = _require_file(dist / "manifest.json", "built extension manifest")
    manifest = _read_json(manifest_path)
    files: List[Tuple[str, Path]] = []
    for path in sorted(dist.rglob("*"), key=lambda p: p.relative_to(dist).as_posix()):
        relative = path.relative_to(dist)
        if not _is_runtime_asset(relative):
            continue
        if replacement_notice is not None and relative.as_posix() == "THIRD_PARTY_NOTICES.txt":
            continue
        if path.is_symlink():
            raise PackageError("built extension contains a symlink: %s" % relative)
        if not path.is_file():
            continue
        archive_name = _safe_archive_name(relative)
        files.append((archive_name, path))

    # Keep the upstream license with downloadable extension artifacts without
    # walking source/docs directories. It is optional for fixture builds.
    extension_license = dist.parent / "LICENSE"
    if (
        extension_license.is_file()
        and not extension_license.is_symlink()
        and not any(name == "LICENSE" for name, _ in files)
    ):
        files.append(("LICENSE", extension_license))
    if replacement_notice is not None:
        files.append(("THIRD_PARTY_NOTICES.txt", replacement_notice))
    if not any(name == "manifest.json" for name, _ in files):
        raise PackageError("built extension manifest was excluded from package")
    return files, manifest


def _manifest_asset_references(manifest: Mapping[str, object]) -> Iterable[str]:
    """Yield local files referenced by a WebExtension manifest."""

    def string_value(value: object) -> Iterable[str]:
        if isinstance(value, str):
            yield value
        elif isinstance(value, list):
            for item in value:
                yield from string_value(item)
        elif isinstance(value, dict):
            for item in value.values():
                yield from string_value(item)

    # Only fields that point to files are inspected; URL patterns and localized
    # message keys elsewhere in the manifest are not file references.
    direct_fields = (
        ("action", "default_popup"),
        ("action", "default_icon"),
        ("side_panel", "default_path"),
        ("options_ui", "page"),
        ("background", "service_worker"),
        ("background", "scripts"),
    )
    for parent, child in direct_fields:
        value = manifest.get(parent)
        if isinstance(value, dict):
            yield from string_value(value.get(child))

    for key in ("icons",):
        yield from string_value(manifest.get(key))

    content_scripts = manifest.get("content_scripts")
    if isinstance(content_scripts, list):
        for script in content_scripts:
            if isinstance(script, dict):
                yield from string_value(script.get("js"))
                yield from string_value(script.get("css"))

    web_resources = manifest.get("web_accessible_resources")
    if isinstance(web_resources, list):
        for resource_group in web_resources:
            if isinstance(resource_group, dict):
                yield from string_value(resource_group.get("resources"))


class _HtmlAssetParser(HTMLParser):
    """Collect local assets loaded by built HTML pages."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.references: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        values = dict(attrs)
        if tag == "script" and values.get("src"):
            self.references.append(values["src"] or "")
        elif tag == "link" and values.get("href"):
            rel = (values.get("rel") or "").lower().split()
            if "stylesheet" in rel:
                self.references.append(values["href"] or "")
        elif tag in {"img", "source", "video", "audio", "iframe"} and values.get("src"):
            self.references.append(values["src"] or "")


def _html_local_reference(value: str) -> Optional[str]:
    value = value.strip()
    if not value or value.startswith(("/", "#", "data:", "blob:", "javascript:")):
        return None
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return None
    return unquote(parsed.path)


def _validate_html_references(files: Sequence[Tuple[str, Path]]) -> None:
    names = {name for name, _ in files}
    missing: List[str] = []
    for name, path in files:
        if not name.endswith(".html"):
            continue
        try:
            source = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            raise PackageError("cannot inspect built HTML asset %s: %s" % (name, exc)) from exc
        parser = _HtmlAssetParser()
        try:
            parser.feed(source)
            parser.close()
        except Exception as exc:
            raise PackageError("cannot parse built HTML asset %s: %s" % (name, exc)) from exc
        for raw_reference in parser.references:
            reference = _html_local_reference(raw_reference)
            if reference is None:
                continue
            try:
                normalized = _safe_archive_name(Path(reference))
            except PackageError:
                missing.append("%s -> %s" % (name, raw_reference))
                continue
            if normalized not in names:
                missing.append("%s -> %s" % (name, raw_reference))
    if missing:
        raise PackageError(
            "built HTML references missing asset(s): %s" % ", ".join(sorted(missing))
        )


def _validate_output_destination(root: Path, output: Path) -> None:
    """Fail closed for unsafe or polluted release destinations."""
    forbidden = {root, root / "extension", root / "extension" / "dist", root / "extension" / "dist_firefox"}
    if output in forbidden or output.is_symlink():
        raise PackageError("output must be a safe release directory, not a source path or symlink")
    if output.exists() and not output.is_dir():
        raise PackageError("output must be a safe release directory: %s" % output)
    if not output.exists():
        return
    allowed = {
        "Corebrain-plugin-%s.zip" % PLUGIN_VERSION,
        "Corebrain-extension-chrome-%s.zip" % EXTENSION_VERSION,
        "Corebrain-extension-firefox-development-%s.zip" % EXTENSION_VERSION,
        "SHA256SUMS",
        *PLUGIN_FILES,
    }
    for child in output.iterdir():
        if child.is_symlink():
            raise PackageError("release output contains a symlink: %s" % child.name)
        if child.name not in allowed:
            raise PackageError("unknown file in release output: %s" % child.name)


def _remove_stale_artifacts(output: Path, artifacts: Sequence[Path]) -> None:
    current = {path.name for path in artifacts}
    stale_name = "Corebrain-extension-firefox-development-%s.zip" % EXTENSION_VERSION
    if stale_name not in current:
        stale = output / stale_name
        if stale.exists():
            stale.unlink()


def _validate_extension_references(
    files: Sequence[Tuple[str, Path]], manifest: Mapping[str, object], browser: str
) -> None:
    names = {name for name, _ in files}
    missing: List[str] = []
    for reference in _manifest_asset_references(manifest):
        # Match only local paths.  URL patterns in manifest fields are not
        # yielded by the field-specific traversal above, but this guard keeps
        # future manifest additions from becoming false missing-file errors.
        if not reference or reference.startswith(("http://", "https://", "<")):
            continue
        reference_path = Path(reference)
        try:
            normalized = _safe_archive_name(reference_path)
        except PackageError:
            missing.append(reference)
            continue
        if any(char in normalized for char in "*?["):
            # WebExtension resources may use globs.  At least one built file
            # must satisfy each glob or the package is broken.
            import fnmatch

            if not any(fnmatch.fnmatch(name, normalized) for name in names):
                missing.append(reference)
        elif normalized not in names:
            missing.append(reference)
    if missing:
        raise PackageError(
            "%s manifest references missing built asset(s): %s"
            % (browser, ", ".join(sorted(set(missing))))
        )

    if browser.lower() == "firefox":
        specific = manifest.get("browser_specific_settings")
        gecko = specific.get("gecko") if isinstance(specific, dict) else None
        extension_id = gecko.get("id") if isinstance(gecko, dict) else None
        if extension_id != "corebrain-clipper@guilhermexp.github.io":
            raise PackageError(
                "Firefox manifest must use the Corebrain id "
                "corebrain-clipper@guilhermexp.github.io"
            )


def _write_zip(destination: Path, files: Sequence[Tuple[str, Path]]) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Fixed timestamps, ordering and permissions make byte output reproducible
    # across machines and invocations.
    with zipfile.ZipFile(
        str(destination),
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
        strict_timestamps=False,
    ) as archive:
        for archive_name, source in sorted(files, key=lambda pair: pair[0]):
            info = zipfile.ZipInfo(archive_name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.extra = b""
            info.comment = b""
            archive.writestr(info, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)


def _copy_standalone_plugin(
    destination: Path, files: Sequence[Tuple[str, Path]]
) -> List[Path]:
    destination.mkdir(parents=True, exist_ok=True)
    copied: List[Path] = []
    for archive_name, source in files:
        name = archive_name.split("/", 1)[1]
        target = destination / name
        target.write_bytes(source.read_bytes())
        target.chmod(0o644)
        copied.append(target)
    return copied

def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_checksums(
    destination: Path, artifacts: Sequence[Path], standalone: Sequence[Path]
) -> None:
    entries = [(path.name, _sha256(path)) for path in artifacts]
    entries.extend((path.name, _sha256(path)) for path in standalone)
    lines = ["%s  %s" % (digest, name) for name, digest in sorted(entries)]
    destination.write_text("\n".join(lines) + "\n", encoding="utf-8")
    destination.chmod(0o644)

def package_release(
    root: Path,
    output: Path,
    include_firefox: Optional[bool] = None,
) -> List[Path]:
    """Package validated runtime inputs into deterministic release artifacts.

    ``include_firefox=None`` packages the optional development build whenever
    ``extension/dist_firefox`` exists.  Pass ``False`` for a Chrome-only release.
    All validation occurs before any existing output is replaced.
    """

    root = Path(root).resolve()
    raw_output = Path(output)
    if raw_output.is_symlink():
        raise PackageError("output must be a safe release directory, not a source path or symlink")
    output = raw_output.resolve()
    _validate_output_destination(root, output)
    plugin_files = _plugin_files(root)

    extension_root = root / "extension"
    firefox_dist = extension_root / "dist_firefox"
    package_firefox = firefox_dist.is_dir() if include_firefox is None else include_firefox

    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".corebrain-release-", dir=str(output.parent)))
    try:
        # Keep generated notices in the private staging directory. This avoids
        # mutating dist/ while ensuring both browser builds use identical text.
        generated_notice = _write_third_party_notices(
            extension_root, stage / "THIRD_PARTY_NOTICES.txt"
        )
        chrome_files, chrome_manifest = _extension_files(
            extension_root / "dist", generated_notice
        )
        _validate_branding(root, chrome_manifest)
        _validate_extension_references(chrome_files, chrome_manifest, "Chrome")
        _validate_html_references(chrome_files)

        firefox_files: Optional[List[Tuple[str, Path]]] = None
        firefox_manifest: Optional[Mapping[str, object]] = None
        if package_firefox:
            firefox_files, firefox_manifest = _extension_files(firefox_dist, generated_notice)
            _validate_branding(root, firefox_manifest)
            _validate_extension_references(firefox_files, firefox_manifest, "Firefox")
            _validate_html_references(firefox_files)

        staged_plugin = stage / ("Corebrain-plugin-%s.zip" % PLUGIN_VERSION)
        staged_chrome = stage / ("Corebrain-extension-chrome-%s.zip" % EXTENSION_VERSION)
        _write_zip(staged_plugin, plugin_files)
        _write_zip(staged_chrome, chrome_files)
        staged_artifacts = [staged_plugin, staged_chrome]
        if firefox_files is not None:
            staged_firefox = stage / (
                "Corebrain-extension-firefox-development-%s.zip" % EXTENSION_VERSION
            )
            _write_zip(staged_firefox, firefox_files)
            staged_artifacts.append(staged_firefox)

        standalone_files = _copy_standalone_plugin(stage, plugin_files)
        _write_checksums(stage / "SHA256SUMS", staged_artifacts, standalone_files)

        output.mkdir(parents=True, exist_ok=True)
        for path in staged_artifacts:
            os.replace(str(path), str(output / path.name))
        _remove_stale_artifacts(output, staged_artifacts)
        os.replace(str(stage / "SHA256SUMS"), str(output / "SHA256SUMS"))
        for path in standalone_files:
            os.replace(str(path), str(output / path.name))
        return [output / path.name for path in staged_artifacts]
    finally:
        shutil.rmtree(str(stage), ignore_errors=True)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        "--repo-root",
        dest="root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="repository root (default: the parent of scripts/)",
    )
    parser.add_argument(
        "--output",
        "--release-dir",
        dest="output",
        type=Path,
        default=None,
        help="release directory (default: ROOT/release)",
    )
    firefox = parser.add_mutually_exclusive_group()
    firefox.add_argument(
        "--include-firefox",
        action="store_true",
        help="require and package extension/dist_firefox as a development ZIP",
    )
    firefox.add_argument(
        "--skip-firefox",
        "--no-firefox",
        action="store_true",
        help="do not package extension/dist_firefox even when present",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parser().parse_args(argv)
    root = args.root.resolve()
    output = (args.output or (root / "release")).resolve()
    include_firefox: Optional[bool]
    if args.include_firefox:
        include_firefox = True
    elif args.skip_firefox:
        include_firefox = False
    else:
        include_firefox = None
    try:
        artifacts = package_release(root, output, include_firefox=include_firefox)
    except PackageError as exc:
        print("package-release: ERROR: %s" % exc, file=sys.stderr)
        return 2
    for artifact in artifacts:
        print(artifact)
    print(output / "SHA256SUMS")
    for name in PLUGIN_FILES:
        print(output / name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
