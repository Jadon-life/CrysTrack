"""Optional cloud-only workaround: flatten the verified official PG15 image for Docker vfs.

Never connects to a database. Preserves image runtime configuration and filesystem;
changes only layer packaging. Not needed on Docker Desktop/overlay2.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".local-supabase"
DOCKER = ["docker", "--host", "unix:///var/run/docker.sock"]
TAG = "supabase/postgres:15.8.1.085"
DIGEST = "sha256:caae3d066f437332d593011e3e7ecf78ab005ce9b89378efd53f97f0410563ad"
SOURCE = "registry-1.docker.io/supabase/postgres@" + DIGEST


def prepare():
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        raise SystemExit("Optional vfs workaround supports Linux amd64 only; use normal local:start otherwise.")
    if subprocess.check_output(DOCKER + ["info", "--format", "{{.Driver}}"], text=True).strip() != "vfs":
        raise SystemExit("No vfs workaround needed; use local:start.")
    if subprocess.run(DOCKER + ["image", "inspect", TAG], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        raise SystemExit("Image already cached; refusing to overwrite it.")
    base = "https://github.com/google/go-containerregistry/releases/download/v0.20.3/"
    name = "go-containerregistry_Linux_x86_64.tar.gz"
    with urllib.request.urlopen(base + "checksums.txt", timeout=60) as response:
        checksum = next(line.split()[0] for line in response.read().decode().splitlines() if line.split()[-1] == name)
    with urllib.request.urlopen(base + name, timeout=120) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != checksum:
        raise SystemExit("Crane checksum mismatch; nothing executed.")
    binary = STATE / "bin/crane"
    binary.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        member = archive.getmember("crane")
        if not member.isfile():
            raise SystemExit("Invalid crane archive")
        binary.write_bytes(archive.extractfile(member).read())
    binary.chmod(0o700)
    # No login/account credentials are consulted for these public image artifacts.
    empty_config = STATE / "empty-docker-config"
    empty_config.mkdir(exist_ok=True)
    env = {k: os.environ[k] for k in ["PATH", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"] if k in os.environ}
    env["DOCKER_CONFIG"] = str(empty_config)
    crane = [str(binary), "--platform", "linux/amd64"]
    config = json.loads(subprocess.check_output(crane + ["config", SOURCE], env=env))["config"]
    changes = []
    for item in config.get("Env", []):
        key, value = item.split("=", 1)
        changes += ["--change", "ENV " + key + "=" + json.dumps(value)]
    for field, instruction in [("Entrypoint", "ENTRYPOINT"), ("Cmd", "CMD"), ("Volumes", "VOLUME")]:
        if config.get(field):
            value = list(config[field]) if isinstance(config[field], dict) else config[field]
            changes += ["--change", instruction + " " + json.dumps(value)]
    for field, instruction in [("User", "USER"), ("WorkingDir", "WORKDIR"), ("StopSignal", "STOPSIGNAL")]:
        if config.get(field):
            changes += ["--change", instruction + " " + config[field]]
    for port in config.get("ExposedPorts", {}):
        changes += ["--change", "EXPOSE " + port]
    labels = {**(config.get("Labels") or {}), "com.crystrack.local.source": DIGEST}
    for key, value in labels.items():
        changes += ["--change", "LABEL " + key + "=" + json.dumps(value)]
    if config.get("Shell"):
        changes += ["--change", "SHELL " + json.dumps(config["Shell"])]
    for instruction in config.get("OnBuild") or []:
        changes += ["--change", "ONBUILD " + instruction]
    health = config.get("Healthcheck") or {}
    if health:
        command = health["Test"]
        if command == ["NONE"]:
            changes += ["--change", "HEALTHCHECK NONE"]
        elif command[0] in ["CMD", "CMD-SHELL"]:
            options = []
            for key, flag in [("Interval", "interval"), ("Timeout", "timeout"), ("StartPeriod", "start-period"), ("StartInterval", "start-interval")]:
                if health.get(key):
                    options.append(f"--{flag}={health[key]}ns")
            if health.get("Retries"):
                options.append(f"--retries={health['Retries']}")
            value = json.dumps(command[1:]) if command[0] == "CMD" else command[1]
            changes += ["--change", "HEALTHCHECK " + " ".join(options) + " CMD " + value]
        else:
            raise SystemExit("Unknown image healthcheck; refusing to flatten.")
    # Crane resolves whiteouts and verifies registry content digests while streaming.
    export = subprocess.Popen(crane + ["export", SOURCE, "-"], env=env, stdout=subprocess.PIPE)
    imported = subprocess.run(DOCKER + ["import", *changes, "-", TAG], stdin=export.stdout, stdout=subprocess.DEVNULL)
    export.stdout.close()
    if export.wait() != 0 or imported.returncode != 0:
        subprocess.run(DOCKER + ["image", "rm", TAG], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        raise SystemExit("Flatten failed; imported tag was removed.")
    actual = json.loads(subprocess.check_output(DOCKER + ["image", "inspect", TAG]))[0]["Config"]
    for key in ["Env", "Entrypoint", "Cmd", "User", "WorkingDir", "StopSignal", "ExposedPorts", "Volumes", "Healthcheck", "OnBuild", "Shell"]:
        if (actual.get(key) or None) != (config.get(key) or None):
            subprocess.run(DOCKER + ["image", "rm", TAG], stdout=subprocess.DEVNULL)
            raise SystemExit("Runtime configuration mismatch; imported tag removed.")
    print("Prepared local-only, single-layer PG15 cache; original source digest and runtime configuration verified.")


if __name__ == "__main__":
    prepare()
