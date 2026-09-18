"""Tests for the deterministic, privacy-preserving release packager."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "package-release.py"

spec = importlib.util.spec_from_file_location("package_release", SCRIPT)
assert spec and spec.loader
package_release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package_release)


class PackageReleaseTests(unittest.TestCase):
    def make_fixture(self) -> Path:
        root = Path(self.tmp.name)
        (root / "extension" / "dist").mkdir(parents=True)
        (root / "extension" / "dist" / "icons").mkdir()
        (root / "scripts").mkdir()

        (root / "manifest.json").write_text(
            json.dumps(
                {
                    "id": "clippings-gallery",
                    "name": "Corebrain",
                    "version": "0.3.0",
                    "minAppVersion": "1.9.0",
                }
            ),
            encoding="utf-8",
        )
        (root / "versions.json").write_text('{"0.3.0":"1.9.0"}\n', encoding="utf-8")
        for name, value in {
            "main.js": "module.exports = {};\n",
            "styles.css": ".corebrain {}\n",
            "LICENSE": "MIT\n",
        }.items():
            (root / name).write_text(value, encoding="utf-8")

        package = {
            "name": "corebrain-clipper",
            "version": "1.8.0",
            "homepage": "https://github.com/guilhermexp/Corebrain",
            "dependencies": {
                "dayjs": "1.11.13",
                "highlight.js": "11.11.1",
            },
        }
        (root / "extension" / "package.json").write_text(
            json.dumps(package), encoding="utf-8"
        )
        (root / "extension" / "LICENSE").write_text("Upstream MIT notice\n", encoding="utf-8")
        for name, version, license_text in (
            ("dayjs", "1.11.13", "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy.\n"),
            ("highlight.js", "11.11.1", "BSD 3-Clause License\n\nRedistribution and use in source and binary forms are permitted.\n"),
            ("webextension-polyfill", "0.12.0", "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy.\n"),
        ):
            package_dir = root / "extension" / "node_modules" / name
            package_dir.mkdir(parents=True)
            (package_dir / "package.json").write_text(
                json.dumps({"name": name, "version": version, "license": "MIT"}),
                encoding="utf-8",
            )
            (package_dir / "LICENSE").write_text(license_text, encoding="utf-8")
        manifest = {
            "manifest_version": 3,
            "name": "Corebrain Web Clipper",
            "version": "1.8.0",
            "homepage_url": "https://github.com/guilhermexp/Corebrain",
            "action": {"default_popup": "popup.html"},
            "icons": {"16": "icons/icon16.png"},
            "background": {"service_worker": "background.js"},
        }
        dist = root / "extension" / "dist"
        (dist / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        for relative, value in {
            "popup.html": "<main>Corebrain</main>\n",
            "background.js": "self.addEventListener('install', () => {});\n",
            "icons/icon16.png": "not really a png in this fixture\n",
            "providers.json": "[]\n",
            "THIRD_PARTY_NOTICES.txt": "Bundled license notice\n",
        }.items():
            path = dist / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value, encoding="utf-8")
        return root

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.make_fixture()
        self.output = self.root / "release"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_packages_are_allowlisted_and_have_stable_layout(self) -> None:
        artifacts = package_release.package_release(self.root, self.output)

        plugin_zip = self.output / "Corebrain-plugin-0.3.0.zip"
        extension_zip = self.output / "Corebrain-extension-chrome-1.8.0.zip"
        self.assertEqual({path.name for path in artifacts}, {plugin_zip.name, extension_zip.name})

        with zipfile.ZipFile(plugin_zip) as archive:
            self.assertEqual(
                archive.namelist(),
                [
                    "clippings-gallery/LICENSE",
                    "clippings-gallery/main.js",
                    "clippings-gallery/manifest.json",
                    "clippings-gallery/styles.css",
                ],
            )
            self.assertNotIn("clippings-gallery/data.json", archive.namelist())

        with zipfile.ZipFile(extension_zip) as archive:
            names = archive.namelist()
            self.assertEqual(names[0], "LICENSE")
            self.assertIn("manifest.json", names)
            self.assertIn("LICENSE", names)
            self.assertIn("THIRD_PARTY_NOTICES.txt", names)
            self.assertNotIn("node_modules/secret.js", names)
            self.assertNotIn("settings.json", names)
            self.assertNotIn("background.js.map", names)
            self.assertTrue(all(not name.startswith("/" ) for name in names))
            self.assertEqual(names, sorted(names))

        checksums = (self.output / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
        standalone = self.output
        expected_checksums = [
            f"{hashlib.sha256(extension_zip.read_bytes()).hexdigest()}  {extension_zip.name}",
            f"{hashlib.sha256(plugin_zip.read_bytes()).hexdigest()}  {plugin_zip.name}",
        ]
        expected_checksums.extend(
            f"{hashlib.sha256((standalone / name).read_bytes()).hexdigest()}  {name}"
            for name in sorted(package_release.PLUGIN_FILES)
        )
        self.assertEqual(checksums, sorted(expected_checksums, key=lambda line: line.split("  ", 1)[1]))
        standalone = self.output
        self.assertEqual(
            sorted(
                path.name for path in standalone.iterdir() if path.name in package_release.PLUGIN_FILES
            ),
            ["LICENSE", "main.js", "manifest.json", "styles.css"],
        )
        self.assertFalse((self.output / "plugin").exists())

    def test_extension_notice_contains_full_production_dependency_licenses(self) -> None:
        package_release.package_release(self.root, self.output)

        with zipfile.ZipFile(self.output / "Corebrain-extension-chrome-1.8.0.zip") as archive:
            notice = archive.read("THIRD_PARTY_NOTICES.txt").decode("utf-8")

        self.assertIn("dayjs@1.11.13", notice)
        self.assertIn("Permission is hereby granted, free of charge", notice)
        self.assertIn("highlight.js@11.11.1", notice)
        self.assertIn("Redistribution and use in source and binary forms", notice)
        self.assertIn("webextension-polyfill@0.12.0", notice)

    def test_private_files_are_rejected_even_when_present_in_built_directory(self) -> None:
        dist = self.root / "extension" / "dist"
        (dist / "data.json").write_text("private\n", encoding="utf-8")
        (dist / ".env.custom").write_text("TOKEN=private\n", encoding="utf-8")
        (dist / "private-notes.md").write_text("private\n", encoding="utf-8")
        (dist / "settings.json").write_text("private\n", encoding="utf-8")
        (dist / "secret.js").write_text("private\n", encoding="utf-8")
        (dist / ".DS_Store").write_text("private\n", encoding="utf-8")
        (dist / "icons" / "icons.test.ts").write_text("private\n", encoding="utf-8")
        (dist / "icons" / "icons.ts").write_text("private\n", encoding="utf-8")
        (dist / "icons" / "icons.d.ts").write_text("private\n", encoding="utf-8")
        (dist / "background.js.map").write_text("{}\n", encoding="utf-8")
        (dist / "node_modules").mkdir()
        (dist / "node_modules" / "secret.js").write_text("private\n", encoding="utf-8")

        package_release.package_release(self.root, self.output)

        with zipfile.ZipFile(self.output / "Corebrain-extension-chrome-1.8.0.zip") as archive:
            names = archive.namelist()
        self.assertFalse(any(name == "data.json" or name.endswith(".map") for name in names))
        self.assertFalse(any(name.startswith("node_modules/") for name in names))
        self.assertFalse(any(name in {".env.custom", "private-notes.md", "settings.json", "secret.js", ".DS_Store"} for name in names))
        self.assertFalse(any(name.startswith("icons/icons.") and not name.endswith(".png") for name in names))


    def test_official_firefox_identity_is_rejected(self) -> None:
        firefox = self.root / "extension" / "dist_firefox"
        shutil.copytree(self.root / "extension" / "dist", firefox)
        manifest_path = firefox / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["browser_specific_settings"] = {"gecko": {"id": "clipper@obsidian.md"}}
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        with self.assertRaisesRegex(package_release.PackageError, r"Corebrain id"):
            package_release.package_release(self.root, self.output, include_firefox=True)
        self.assertFalse(self.output.exists())


    def test_rebuilding_chrome_only_removes_stale_firefox_and_rejects_unknown_output(self) -> None:
        firefox = self.root / "extension" / "dist_firefox"
        shutil.copytree(self.root / "extension" / "dist", firefox)
        manifest_path = firefox / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["browser_specific_settings"] = {"gecko": {"id": "corebrain-clipper@guilhermexp.github.io"}}
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        package_release.package_release(self.root, self.output, include_firefox=True)
        firefox_zip = self.output / "Corebrain-extension-firefox-development-1.8.0.zip"
        self.assertTrue(firefox_zip.exists())

        package_release.package_release(self.root, self.output, include_firefox=False)
        self.assertFalse(firefox_zip.exists())

        (self.output / "private-notes.md").write_text("must not upload\n", encoding="utf-8")
        with self.assertRaisesRegex(package_release.PackageError, r"unknown file"):
            package_release.package_release(self.root, self.output, include_firefox=False)

    def test_output_must_not_be_repository_root_or_symlink(self) -> None:
        with self.assertRaisesRegex(package_release.PackageError, r"safe release directory"):
            package_release.package_release(self.root, self.root, include_firefox=False)

        target = self.root / "release-target"
        target.mkdir()
        link = self.root / "release-link"
        link.symlink_to(target, target_is_directory=True)
        with self.assertRaisesRegex(package_release.PackageError, r"symlink"):
            package_release.package_release(self.root, link, include_firefox=False)

        dangling = self.root / "release-dangling"
        dangling.symlink_to(self.root / "does-not-exist")
        with self.assertRaisesRegex(package_release.PackageError, r"symlink"):
            package_release.package_release(self.root, dangling, include_firefox=False)

    def test_missing_referenced_extension_asset_fails_before_writing_release(self) -> None:
        (self.root / "extension" / "dist" / "popup.html").unlink()

        with self.assertRaisesRegex(package_release.PackageError, r"popup\.html"):
            package_release.package_release(self.root, self.output)
        self.assertFalse(self.output.exists())


    def test_missing_html_script_asset_fails_before_writing_release(self) -> None:
        (self.root / "extension" / "dist" / "background.js").unlink()
        (self.root / "extension" / "dist" / "popup.html").write_text(
            '<script src="background.js"></script>\n', encoding="utf-8"
        )

        with self.assertRaisesRegex(package_release.PackageError, r"background\.js"):
            package_release.package_release(self.root, self.output)
        self.assertFalse(self.output.exists())

    def test_missing_plugin_runtime_asset_fails(self) -> None:
        (self.root / "styles.css").unlink()

        with self.assertRaisesRegex(package_release.PackageError, r"styles\.css"):
            package_release.package_release(self.root, self.output)
        self.assertFalse(self.output.exists())

    def test_repeating_packaging_is_byte_for_byte_deterministic(self) -> None:
        package_release.package_release(self.root, self.output)
        first = {
            path.name: path.read_bytes()
            for path in self.output.iterdir()
            if path.is_file()
        }
        package_release.package_release(self.root, self.output)
        second = {
            path.name: path.read_bytes()
            for path in self.output.iterdir()
            if path.is_file()
        }
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
