#!/usr/bin/env python3
"""Build a source-free local installer ZIP from reviewed, exported images.

Build-host utility only: Python/Git/Docker are not installed on the target by it.
Checksums establish transfer integrity, not the identity of a release publisher.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime, timezone


class ReleaseError(Exception):
    """A safe operator-facing failure, without daemon/config/secret output."""


IMAGE_ID = re.compile(r"sha256:[0-9a-f]{64}\Z")
IMAGE_REF = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_./:@-]*\Z")
COMMIT_ID = re.compile(r"[0-9a-f]{40}(?:[0-9a-f]{24})?\Z")
VERSION = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?\Z")

REQUIRED_FILES = (
    "compose.yaml", "compose.tls.yaml", ".env.example", "LICENSE", "README.md", "IMPLEMENTATION_STATUS.md",
    "docs/LAN_DEPLOYMENT.md", "docs/LAN_HTTPS.md", "docs/WINDOWS_LOCAL.md",
    "docs/OFFLINE_RELEASE.md", "docs/DOWNLOAD_LOCAL.md", "docs/DEPENDENCIES.md", "docs/ASSET_LICENSES.md",
    "docs/ACCEPTANCE_REPORT.md", "docs/docker/nginx.conf", "docs/docker/nginx-tls.conf",
    "docs/verification/local-release-checks.txt", "docs/verification/local-tls.txt",
    "docs/verification/media-revocation.txt",
    "scripts/docker-backup.sh", "scripts/docker-restore.sh", "scripts/offline-load.sh",
    "scripts/docker-offline-verify.sh", "data/vocabulary_sample_100.csv", "data/test-tone.wav",
)
REQUIRED_WINDOWS = ("HanNguBien.ps1", "Common.ps1", "BackupRestore.ps1")
OPTIONAL_DOCS = ("docs/LOCAL_RELEASE_REPORT.md", "docs/LOCAL_ACCEPTANCE_REPORT.md")


def regular_file(path):
    """Reject links/reparse-like filesystem indirection before reading input."""
    path = Path(path).absolute()
    for parent in (path, *path.parents):
        if parent.is_symlink():
            raise ReleaseError("Refusing a symlink in a release input/output path.")
    try:
        mode = path.stat().st_mode
    except OSError as error:
        raise ReleaseError("A required release input is missing or unreadable.") from error
    if not stat.S_ISREG(mode):
        raise ReleaseError("Release inputs must be regular files.")
    return path


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def command(arguments, root, message):
    try:
        result = subprocess.run(arguments, cwd=root, capture_output=True, text=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ReleaseError(message) from error
    if result.returncode:
        raise ReleaseError(message)
    return result.stdout


def git(root, *arguments):
    return command(["git", *arguments], root, "Git provenance validation failed; use a clean reviewed checkout.")


def clean_head(root):
    if git(root, "status", "--porcelain=v1", "--untracked-files=all").strip():
        raise ReleaseError("Commit source and operator changes before packaging; the checkout must be clean.")
    commit = git(root, "rev-parse", "HEAD").strip()
    if not COMMIT_ID.fullmatch(commit):
        raise ReleaseError("Git returned an invalid commit identifier.")
    return commit


def read_image_set(archive):
    archive = regular_file(archive)
    manifest_path = regular_file(str(archive) + ".images")
    checksum_path = regular_file(str(archive) + ".sha256")
    expected = {}
    try:
        for line in checksum_path.read_text(encoding="utf-8").splitlines():
            match = re.fullmatch(r"([0-9a-fA-F]{64}) [ *]([^/\\\r\n]+)", line)
            if not match or match[2] in expected:
                raise ReleaseError("Invalid or duplicate image checksum entry.")
            expected[match[2]] = match[1].lower()
        if set(expected) != {archive.name, manifest_path.name}:
            raise ReleaseError("Image checksums must cover exactly the archive and its .images manifest.")
        manifest = manifest_path.read_bytes()
        if hashlib.sha256(manifest).hexdigest() != expected[manifest_path.name]:
            raise ReleaseError("Image manifest checksum mismatch; no package was published.")
        if sha256_file(archive) != expected[archive.name]:
            raise ReleaseError("Image archive checksum mismatch; no package was published.")
        images = {}
        for line in manifest.decode("utf-8").splitlines():
            parts = line.split()
            if len(parts) != 2 or not IMAGE_ID.fullmatch(parts[0]) or not IMAGE_REF.fullmatch(parts[1]) or parts[1] in images:
                raise ReleaseError("Invalid or duplicate image manifest entry.")
            images[parts[1]] = parts[0]
        if len(images) != 4:
            raise ReleaseError("The archive must describe exactly four distinct image references.")
    except (OSError, UnicodeError) as error:
        raise ReleaseError("Cannot read image archive metadata.") from error
    return archive, images, manifest, expected[archive.name]


def operator_only(path):
    """Changes here affect the bundle, not the application's built filesystem."""
    if path.startswith("tests/") or path.startswith("scripts/windows/"):
        return True
    if path.startswith("docs/") and not path.startswith("docs/docker/"):
        return True
    if path in {"docs/docker/nginx.conf", "docs/docker/nginx-tls.conf", ".env.example", ".gitattributes"}:
        return True
    if "/" not in path and (path.endswith(".md") or re.fullmatch(r"compose(?:\.[A-Za-z0-9_-]+)?\.ya?ml", path)):
        return True
    return path == "scripts/package-offline.py" or bool(re.fullmatch(r"scripts/(?:docker|offline)-[A-Za-z0-9_-]+\.sh", path))


def image_provenance(root, images, references, version):
    if set(images) != set(references.values()) or len(set(references.values())) != 4:
        raise ReleaseError("Image references do not match the app/tools/database/proxy selected for this release.")
    details = {}
    revisions = set()
    for role, reference in references.items():
        try:
            data = json.loads(command(["docker", "image", "inspect", reference], root, "Cannot inspect a required local image; no pull was attempted."))
            if not isinstance(data, list) or len(data) != 1:
                raise ValueError("unexpected image response")
            image = data[0]
            config = image.get("Config") or {}
            labels = config.get("Labels") or {}
        except (ValueError, TypeError, KeyError) as error:
            raise ReleaseError("Docker returned invalid image metadata.") from error
        if image.get("Id") != images[reference]:
            raise ReleaseError("A local image ID differs from the exported manifest.")
        if image.get("Os") != "linux" or image.get("Architecture") != "amd64":
            raise ReleaseError("This release supports Linux/amd64 images only.")
        for entry in config.get("Env") or []:
            key = entry.partition("=")[0].upper()
            if any(word in key for word in ("PASSWORD", "SECRET", "TOKEN")) or key in {
                "DATABASE_URL", "API_KEY", "PRIVATE_KEY", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
            }:
                raise ReleaseError("An image contains a credential environment key; rebuild without baked-in credentials.")
        if role in {"app", "tools"}:
            revision = labels.get("org.opencontainers.image.revision", "")
            if not COMMIT_ID.fullmatch(revision) or labels.get("org.opencontainers.image.version") != version:
                raise ReleaseError("Application image revision/version labels do not match this release.")
            if labels.get("vn.hanngubien.build-method") != "source-docker":
                raise ReleaseError("Release images must come from the reviewed source Docker build.")
            revisions.add(revision)
        details[role] = {"reference": reference, "id": image["Id"]}
    if len(revisions) != 1:
        raise ReleaseError("App and tools were not built from the same source commit.")
    revision = revisions.pop()
    git(root, "merge-base", "--is-ancestor", revision, "HEAD")
    changed = git(root, "diff", "--name-only", "-z", revision, "HEAD").split("\0")
    if any(path and not operator_only(path) for path in changed):
        raise ReleaseError("Runtime source changed after the application image build; rebuild and export the images.")
    return revision, details


def payload_files(root, references):
    files = {}
    for relative in REQUIRED_FILES:
        files[relative] = regular_file(root / relative).read_bytes()
    for relative in OPTIONAL_DOCS:
        if (root / relative).exists():
            files[relative] = regular_file(root / relative).read_bytes()
    windows = root / "scripts/windows"
    for name in REQUIRED_WINDOWS:
        regular_file(windows / name)
    for path in sorted(windows.glob("*.ps1")):
        files[path.relative_to(root).as_posix()] = regular_file(path).read_bytes()
    templates = list(sorted((root / "templates").glob("*.csv")))
    if not templates:
        raise ReleaseError("The release requires at least one CSV import template.")
    for path in templates:
        files[path.relative_to(root).as_posix()] = regular_file(path).read_bytes()
    # Environment examples contain no generated secrets. Pin the selected tags
    # for manual Linux setup as well as the RELEASE.json-aware Windows helper.
    text = files[".env.example"].decode("utf-8")
    keys = {"HANNGU_IMAGE": "app", "HANNGU_TOOLS_IMAGE": "tools", "POSTGRES_IMAGE": "postgres", "NGINX_IMAGE": "nginx"}
    lines = [line for line in text.splitlines() if line.partition("=")[0] not in keys]
    lines += ["", "# Images verified for this offline release; do not retag another build."]
    lines += [f"{key}={references[role]}" for key, role in keys.items()]
    files[".env.example"] = ("\n".join(lines) + "\n").encode("utf-8")
    return files


def portable_member_names(names):
    seen = set()
    reserved = {"CON", "PRN", "AUX", "NUL"} | {f"{prefix}{number}" for prefix in ("COM", "LPT") for number in range(1, 10)}
    for name in names:
        if name.casefold() in seen:
            raise ReleaseError("Release paths collide on Windows; rename the conflicting operator file.")
        seen.add(name.casefold())
        for part in name.split("/"):
            if not part or part in {".", ".."} or part.endswith((" ", ".")) or any(ord(character) < 32 or character in '<>:"\\|?*' for character in part) or part.split(".", 1)[0].upper() in reserved:
                raise ReleaseError("A release filename is not portable to Windows.")


def zip_member(package, name, data, mode=0o644):
    info = zipfile.ZipInfo(name)
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | mode) << 16
    info.compress_type = zipfile.ZIP_STORED
    package.writestr(info, data)


def publish_pair(temporary_zip, output, temporary_checksum):
    """No-clobber publication; checksum last makes the completion marker explicit."""
    published = []
    try:
        for source, destination in ((temporary_zip, output), (temporary_checksum, Path(str(output) + ".sha256"))):
            os.link(source, destination)
            published.append((source, destination))
    except OSError as error:
        for source, destination in reversed(published):
            try:
                if os.path.samefile(source, destination):
                    destination.unlink()
            except OSError:
                pass
        raise ReleaseError("Cannot publish release files without overwriting; no complete release was published.") from error


def create_package(root, archive, output, version, references):
    root = Path(root).resolve()
    output = Path(os.path.abspath(output))
    if not VERSION.fullmatch(version):
        raise ReleaseError("Use a valid x.y.z or x.y.z-rc.n release version.")
    if output.suffix.lower() != ".zip":
        raise ReleaseError("The release output must end in .zip.")
    for candidate in (output, Path(str(output) + ".sha256"), *output.parents):
        if candidate.is_symlink():
            raise ReleaseError("Refusing a symlink in the release output path.")
    try:
        output.relative_to(root / "work")
    except ValueError as error:
        raise ReleaseError("Write generated release files under the repository work/ directory.") from error
    if output.exists() or Path(str(output) + ".sha256").exists():
        raise ReleaseError("Refusing to overwrite an existing release ZIP or checksum.")
    packaging_commit = clean_head(root)
    archive, images, manifest, archive_hash = read_image_set(archive)
    source_commit, details = image_provenance(root, images, references, version)
    files = payload_files(root, references)
    metadata = {
        "formatVersion": 1, "version": version, "sourceCommit": source_commit,
        "packagingCommit": packaging_commit, "platform": "linux/amd64", "images": details,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "acceptance": {"independentAirgap": "NOT TESTED", "actualWindows": "NOT TESTED"},
    }
    files["RELEASE.json"] = (json.dumps(metadata, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    internal_archive = "images/hnb-images.tar.gz"
    files[internal_archive + ".images"] = manifest
    files[internal_archive + ".sha256"] = (
        f"{archive_hash}  hnb-images.tar.gz\n"
        f"{hashlib.sha256(manifest).hexdigest()}  hnb-images.tar.gz.images\n"
    ).encode("ascii")
    checksums = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
    checksums[internal_archive] = archive_hash
    files["SHA256SUMS"] = "".join(f"{checksums[name]}  {name}\n" for name in sorted(checksums)).encode("utf-8")
    portable_member_names([*files, internal_archive])
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.TemporaryDirectory(prefix=".hnb-release-", dir=output.parent) as temporary:
            temporary_zip = Path(temporary) / "release.zip"
            temporary_checksum = Path(temporary) / "release.zip.sha256"
            with zipfile.ZipFile(temporary_zip, "w", allowZip64=True) as package:
                for name, data in sorted(files.items()):
                    zip_member(package, name, data, 0o755 if name.endswith(".sh") else 0o644)
                # Read directly from the verified archive; never create a second
                # unpacked tar or full archive copy in the build workspace.
                info = zipfile.ZipInfo(internal_archive)
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                digest = hashlib.sha256()
                with package.open(info, "w", force_zip64=True) as destination, archive.open("rb") as source:
                    for chunk in iter(lambda: source.read(1024 * 1024), b""):
                        destination.write(chunk)
                        digest.update(chunk)
                if digest.hexdigest() != archive_hash:
                    raise ReleaseError("Image archive changed while packaging; no release was published.")
            if clean_head(root) != packaging_commit:
                raise ReleaseError("Source checkout changed while packaging; no release was published.")
            temporary_checksum.write_text(f"{sha256_file(temporary_zip)}  {output.name}\n", encoding="ascii")
            publish_pair(temporary_zip, output, temporary_checksum)
    except OSError as error:
        raise ReleaseError("Release write failed; check free space and filesystem permissions.") from error
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--app-image")
    parser.add_argument("--tools-image")
    parser.add_argument("--postgres-image", default="postgres:17-alpine")
    parser.add_argument("--nginx-image", default="nginx:1.28-alpine")
    arguments = parser.parse_args()
    references = {
        "app": arguments.app_image or f"han-ngu-bien:{arguments.version}",
        "tools": arguments.tools_image or f"han-ngu-bien-tools:{arguments.version}",
        "postgres": arguments.postgres_image, "nginx": arguments.nginx_image,
    }
    if any(not IMAGE_REF.fullmatch(reference) for reference in references.values()):
        parser.error("Invalid image reference.")
    try:
        result = create_package(Path(__file__).resolve().parents[1], arguments.images, arguments.output, arguments.version, references)
    except (ReleaseError, ValueError, UnicodeError) as error:
        print(f"Offline release: FAIL — {error}", file=sys.stderr)
        return 1
    print(f"Offline release: PASS — {arguments.output} ({result['platform']}, {result['version']}).")
    print("Transfer the ZIP and its .sha256 from a trusted source. Actual Windows/independent LAN acceptance remains NOT TESTED.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
