"""Reset an account's password from this computer when nobody can sign in.

The password is typed without echo and only its scrypt hash leaves this machine. Targets the
production deployment through CONVEX_DEPLOY_KEY in .env.prod (never committed).
"""
import getpass, json, os, pathlib, subprocess, sys
root = pathlib.Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    sys.exit("Usage: python scripts/reset-password.py <username>")
key = next((l.split("=", 1)[1].strip() for l in (root / ".env.prod").read_text(encoding="utf-8").splitlines()
            if l.startswith("CONVEX_DEPLOY_KEY=")), "")
if not key.startswith("prod:"):
    sys.exit("Put the production deploy key in .env.prod first (CONVEX_DEPLOY_KEY=prod:...).")
password = getpass.getpass("New password (8+ characters): ")
if len(password) < 8 or len(password) > 256:
    sys.exit("Password must be 8 to 256 characters.")
if password != getpass.getpass("Confirm password: "):
    sys.exit("Passwords do not match.")
js = "const c=require('node:crypto');let p='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>p+=d);process.stdin.on('end',()=>{const s=c.randomBytes(16).toString('hex');process.stdout.write('scrypt:'+s+':'+c.scryptSync(p,s,64).toString('hex'));});"
hashed = subprocess.run(["node", "-e", js], input=password, text=True, capture_output=True, check=True).stdout
password = None
payload = json.dumps({"username": sys.argv[1], "passwordHash": hashed})
env = {**os.environ, "CONVEX_DEPLOY_KEY": key}
result = subprocess.run(["node", str(root / "node_modules/convex/bin/main.js"), "run", "authSessions:resetPassword", payload], cwd=root, env=env)
sys.exit(result.returncode)
