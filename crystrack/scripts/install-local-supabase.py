"""Install one pinned official CLI, checking SHA-256 before extracting any code."""
import hashlib
import io
import os
from pathlib import Path
import platform
import tarfile
import urllib.request

VERSION = "2.39.2"
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / ".local-supabase" / "bin" / "supabase"


def install():
    system = {"Linux": "linux", "Darwin": "darwin"}.get(platform.system())
    arch = {"x86_64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(platform.machine())
    if not system or not arch:
        raise SystemExit("This local Docker workflow requires Linux/macOS amd64/arm64.")
    name = f"supabase_{system}_{arch}.tar.gz"
    base = f"https://github.com/supabase/cli/releases/download/v{VERSION}/"
    with urllib.request.urlopen(base + f"supabase_{VERSION}_checksums.txt", timeout=60) as response:
        manifest = response.read().decode()
    expected = next(line.split()[0] for line in manifest.splitlines() if line.split()[-1] == name)
    with urllib.request.urlopen(base + name, timeout=120) as response:
        archive = response.read()
    if hashlib.sha256(archive).hexdigest() != expected:
        raise SystemExit("Supabase CLI checksum mismatch; nothing installed.")
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as bundle:
        member = bundle.getmember("supabase")
        if not member.isfile():
            raise SystemExit("Invalid CLI archive")
        binary = bundle.extractfile(member).read()
    DEST.parent.mkdir(parents=True, exist_ok=True)
    temporary = DEST.with_suffix(".download")
    temporary.write_bytes(binary)
    temporary.chmod(0o700)
    os.replace(temporary, DEST)
    print(f"Verified Supabase CLI {VERSION}; installed to ignored local tools directory.")


if __name__ == "__main__":
    install()
