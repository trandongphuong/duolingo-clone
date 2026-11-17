#!/usr/bin/env python3
"""Fault/security checks for the source-free package builder. No real Docker."""

import copy
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve().parents[1] / "scripts/package-offline.py"
SPEC = importlib.util.spec_from_file_location("hnb_release_package", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PackageFixture:
    def __init__(self, directory):
        self.root = Path(directory)
        self.version = "1.0.0-rc.1"
        self.refs = {
            "app": f"han-ngu-bien:{self.version}", "tools": f"han-ngu-bien-tools:{self.version}",
            "postgres": "postgres:17-alpine", "nginx": "nginx:1.28-alpine",
        }
        for name in MODULE.REQUIRED_FILES:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(f"Synthetic test content: {name}\n", encoding="utf-8")
        (self.root / ".env.example").write_text("POSTGRES_PASSWORD=\nSESSION_PASSWORD=\n", encoding="utf-8")
        (self.root / ".gitignore").write_text("work/\n", encoding="utf-8")
        for name in MODULE.REQUIRED_WINDOWS:
            path = self.root / "scripts/windows" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("# Synthetic operator file\n", encoding="ascii")
        (self.root / "templates").mkdir()
        (self.root / "templates/vocabulary_sample.csv").write_text("hanzi,pinyin,meaning_vi\n你好,nǐ hǎo,Xin chào\n", encoding="utf-8")
        (self.root / "app").mkdir()
        (self.root / "app/main.ts").write_text("export const value = 1;\n", encoding="utf-8")
        self.git("init", "-q")
        self.git("config", "user.name", "Synthetic release test")
        self.git("config", "user.email", "release-test@example.invalid")
        self.commit()
        self.source_commit = self.git("rev-parse", "HEAD").strip()
        self.work = self.root / "work"
        self.work.mkdir()
        self.archive = self.work / "input-images.tar.gz"
        self.archive.write_bytes(gzip.compress(b"synthetic archive, no Docker execution"))
        self.metadata = {}
        self.image_ids = {}
        for role, reference in self.refs.items():
            image_id = "sha256:" + hashlib.sha256(role.encode()).hexdigest()
            self.image_ids[reference] = image_id
            self.metadata[reference] = {
                "Id": image_id, "Os": "linux", "Architecture": "amd64",
                "Config": {"Env": ["NODE_ENV=production"], "Labels": {
                    "org.opencontainers.image.revision": self.source_commit,
                    "org.opencontainers.image.version": self.version,
                    "vn.hanngubien.build-method": "source-docker",
                }},
            }
        self.rewrite_manifest()
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.metadata_file = self.work / "docker.json"
        self.call_log = self.work / "docker-calls.txt"
        self.write_metadata()
        fake = self.bin / "docker"
        fake.write_text(
            f"#!{sys.executable}\n"
            "import json,os,sys\n"
            "from pathlib import Path\n"
            "p=Path(os.environ['HNB_FAKE_CALL_LOG']); p.write_text(p.read_text()+'inspect\\n' if p.exists() else 'inspect\\n')\n"
            "items=json.loads(Path(os.environ['HNB_FAKE_METADATA']).read_text())\n"
            "print(json.dumps([items[sys.argv[-1]]]))\n",
            encoding="utf-8",
        )
        fake.chmod(0o755)
        self.environment = {
            "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
            "HNB_FAKE_METADATA": str(self.metadata_file), "HNB_FAKE_CALL_LOG": str(self.call_log),
        }
        self.output = self.work / "releases/hnb-release.zip"

    def git(self, *arguments):
        return subprocess.run(["git", *arguments], cwd=self.root, capture_output=True, text=True, check=True).stdout

    def commit(self):
        self.git("add", ".")
        self.git("commit", "-qm", "Synthetic fixture checkpoint")

    def rewrite_manifest(self, text=None):
        manifest = text or "".join(f"{image_id} {reference}\n" for reference, image_id in self.image_ids.items())
        Path(str(self.archive) + ".images").write_text(manifest, encoding="utf-8")
        checksums = "".join(
            f"{MODULE.sha256_file(path)}  {path.name}\n"
            for path in (self.archive, Path(str(self.archive) + ".images"))
        )
        Path(str(self.archive) + ".sha256").write_text(checksums, encoding="ascii")

    def write_metadata(self):
        self.metadata_file.write_text(json.dumps(self.metadata), encoding="utf-8")

    def package(self, output=None):
        with patch.dict(os.environ, self.environment):
            return MODULE.create_package(self.root, self.archive, output or self.output, self.version, self.refs)


class ReleasePackageTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="hnb-release-test-")
        self.addCleanup(self.directory.cleanup)
        self.fixture = PackageFixture(self.directory.name)

    def assert_unpublished(self):
        self.assertFalse(self.fixture.output.exists())
        self.assertFalse(Path(str(self.fixture.output) + ".sha256").exists())
        self.assertEqual(list(self.fixture.output.parent.glob(".hnb-release-*")), [])

    def test_complete_allowlisted_zip_has_correct_images_provenance_and_checksums(self):
        fixture = self.fixture
        (fixture.work / "test-accounts.json").write_text('{"password":"must-not-ship"}')
        result = fixture.package()
        self.assertEqual(result["platform"], "linux/amd64")
        self.assertEqual(result["sourceCommit"], fixture.source_commit)
        with zipfile.ZipFile(fixture.output) as package:
            names = package.namelist()
            self.assertEqual(len(names), len(set(names)))
            self.assertFalse(any(name.startswith(("work/", ".git/", "app/", ".next/", "node_modules/")) or name == ".env" for name in names))
            metadata = json.loads(package.read("RELEASE.json"))
            self.assertEqual(metadata["images"]["app"], {"reference": fixture.refs["app"], "id": fixture.image_ids[fixture.refs["app"]]})
            self.assertIn(f"HANNGU_IMAGE={fixture.refs['app']}\n", package.read(".env.example").decode())
            self.assertEqual(package.read("images/hnb-images.tar.gz"), fixture.archive.read_bytes())
            image_checksums = package.read("images/hnb-images.tar.gz.sha256").decode().splitlines()
            self.assertEqual({line.split()[1] for line in image_checksums}, {"hnb-images.tar.gz", "hnb-images.tar.gz.images"})
            covered = {}
            for line in package.read("SHA256SUMS").decode().splitlines():
                digest, name = line.split("  ", 1)
                covered[name] = digest
                self.assertEqual(hashlib.sha256(package.read(name)).hexdigest(), digest)
            self.assertEqual(set(covered), set(names) - {"SHA256SUMS"})
            self.assertEqual((package.getinfo("scripts/offline-load.sh").external_attr >> 16) & 0o777, 0o755)
        self.assertEqual(Path(str(fixture.output) + ".sha256").read_text().split()[0], MODULE.sha256_file(fixture.output))

    def test_corrupt_archive_is_rejected_before_any_docker_call(self):
        self.fixture.archive.write_bytes(b"corrupt transfer")
        with self.assertRaisesRegex(MODULE.ReleaseError, "archive checksum mismatch"):
            self.fixture.package()
        self.assertFalse(self.fixture.call_log.exists())
        self.assert_unpublished()

    def test_checksum_path_or_duplicate_manifest_is_rejected_before_docker(self):
        fixture = self.fixture
        checksum = Path(str(fixture.archive) + ".sha256")
        checksum.write_text("a" * 64 + "  ../escape\n")
        with self.assertRaises(MODULE.ReleaseError):
            fixture.package()
        fixture.rewrite_manifest("".join([f"{'sha256:' + 'a' * 64} {fixture.refs['app']}\n"] * 4))
        with self.assertRaisesRegex(MODULE.ReleaseError, "duplicate image manifest"):
            fixture.package()
        self.assertFalse(fixture.call_log.exists())
        self.assert_unpublished()

    def test_wrong_loaded_id_arch_version_build_method_or_secret_env_is_rejected(self):
        fixture = self.fixture
        baseline = copy.deepcopy(fixture.metadata)
        for name in ("id", "arch", "version", "method", "secret", "mismatched-source"):
            with self.subTest(name=name):
                fixture.metadata = copy.deepcopy(baseline)
                image = fixture.metadata[fixture.refs["app"]]
                if name == "id":
                    image["Id"] = "sha256:" + "f" * 64
                elif name == "arch":
                    image["Architecture"] = "arm64"
                elif name == "version":
                    image["Config"]["Labels"]["org.opencontainers.image.version"] = "0.0.1"
                elif name == "method":
                    image["Config"]["Labels"]["vn.hanngubien.build-method"] = "unknown"
                elif name == "secret":
                    image["Config"]["Env"].append("SESSION_PASSWORD=never-print-this-secret")
                else:
                    image["Config"]["Labels"]["org.opencontainers.image.revision"] = "f" * 40
                fixture.write_metadata()
                with self.assertRaises(MODULE.ReleaseError) as caught:
                    fixture.package()
                self.assertNotIn("never-print-this-secret", str(caught.exception))
                self.assert_unpublished()

    def test_dirty_checkout_and_stale_runtime_image_are_refused(self):
        fixture = self.fixture
        (fixture.root / "app/main.ts").write_text("export const value = 2;\n")
        with self.assertRaisesRegex(MODULE.ReleaseError, "checkout must be clean"):
            fixture.package()
        self.assertFalse(fixture.call_log.exists())
        fixture.commit()
        with self.assertRaisesRegex(MODULE.ReleaseError, "Runtime source changed"):
            fixture.package()
        self.assert_unpublished()

    def test_operator_docs_change_is_bundled_with_separate_packaging_commit(self):
        fixture = self.fixture
        (fixture.root / "README.md").write_text("Updated operator guidance\n")
        fixture.commit()
        result = fixture.package()
        self.assertEqual(result["sourceCommit"], fixture.source_commit)
        self.assertEqual(result["packagingCommit"], fixture.git("rev-parse", "HEAD").strip())
        self.assertNotEqual(result["sourceCommit"], result["packagingCommit"])
        with zipfile.ZipFile(fixture.output) as package:
            self.assertEqual(package.read("README.md"), b"Updated operator guidance\n")

    def test_existing_output_and_output_escape_or_symlink_are_refused(self):
        fixture = self.fixture
        fixture.output.parent.mkdir()
        fixture.output.write_bytes(b"existing release")
        with self.assertRaisesRegex(MODULE.ReleaseError, "overwrite"):
            fixture.package()
        self.assertEqual(fixture.output.read_bytes(), b"existing release")
        fixture.output.unlink()
        with self.assertRaisesRegex(MODULE.ReleaseError, "under the repository work"):
            fixture.package(fixture.work / ".." / "escape.zip")
        other = fixture.work / "other.zip"
        other.write_bytes(b"existing target")
        fixture.output.symlink_to(other)
        with self.assertRaisesRegex(MODULE.ReleaseError, "symlink"):
            fixture.package()
        self.assertEqual(other.read_bytes(), b"existing target")

    def test_symlinked_payload_file_is_refused(self):
        fixture = self.fixture
        path = fixture.root / "README.md"
        path.unlink()
        path.symlink_to(fixture.root / "LICENSE")
        fixture.commit()
        with self.assertRaisesRegex(MODULE.ReleaseError, "symlink"):
            fixture.package()
        self.assert_unpublished()

    def test_windows_case_collision_or_reserved_script_name_is_refused(self):
        fixture = self.fixture
        extra = fixture.root / "scripts/windows/common.ps1"
        extra.write_text("# Conflicting Windows name\n")
        fixture.commit()
        with self.assertRaisesRegex(MODULE.ReleaseError, "collide on Windows"):
            fixture.package()
        extra.unlink()
        (fixture.root / "scripts/windows/CON.ps1").write_text("# Reserved Windows name\n")
        fixture.commit()
        with self.assertRaisesRegex(MODULE.ReleaseError, "not portable to Windows"):
            fixture.package()
        self.assert_unpublished()

    def test_archive_modified_during_zip_write_is_not_published(self):
        fixture = self.fixture
        original = MODULE.zip_member
        modified = False

        def write_and_modify(*arguments, **keywords):
            nonlocal modified
            original(*arguments, **keywords)
            if not modified:
                modified = True
                fixture.archive.write_bytes(gzip.compress(b"changed during packaging"))

        with patch.object(MODULE, "zip_member", write_and_modify):
            with self.assertRaisesRegex(MODULE.ReleaseError, "changed while packaging"):
                fixture.package()
        self.assert_unpublished()

    def test_publication_race_rolls_back_only_our_zip_and_preserves_other_checksum(self):
        fixture = self.fixture
        original_link = os.link
        checksum = Path(str(fixture.output) + ".sha256")

        def link_with_race(source, destination):
            if Path(destination) == checksum:
                checksum.write_text("another publisher")
                raise FileExistsError("simulated no-clobber race")
            return original_link(source, destination)

        with patch.object(MODULE.os, "link", link_with_race):
            with self.assertRaisesRegex(MODULE.ReleaseError, "without overwriting"):
                fixture.package()
        self.assertFalse(fixture.output.exists())
        self.assertEqual(checksum.read_text(), "another publisher")
        self.assertEqual(list(fixture.output.parent.glob(".hnb-release-*")), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
