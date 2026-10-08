"""Create a server account after deployment; never echo or store its password."""
import argparse, getpass, json, pathlib, subprocess, sys
parser = argparse.ArgumentParser()
parser.add_argument("username")
parser.add_argument("role", choices=["manager", "cashier"])
parser.add_argument("--prod", action="store_true", help="Target production instead of development")
args = parser.parse_args()
password = getpass.getpass("New password (8+ characters): ")
if len(password) < 8 or len(password) > 256:
    sys.exit("Password must be 8 to 256 characters.")
if password != getpass.getpass("Confirm password: "):
    sys.exit("Passwords do not match.")
root = pathlib.Path(__file__).resolve().parents[1]
js = "const c=require('node:crypto');let p='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>p+=d);process.stdin.on('end',()=>{const s=c.randomBytes(16).toString('hex');process.stdout.write('scrypt:'+s+':'+c.scryptSync(p,s,64).toString('hex'));});"
hashed = subprocess.run(["node", "-e", js], input=password, text=True, capture_output=True, check=True).stdout
password = None
payload = json.dumps({"username":args.username.strip().lower(), "role":args.role, "passwordHash":hashed})
command = ["node", str(root/"node_modules/convex/bin/main.js"), "run", "authSessions:provision", payload]
if args.prod: command.append("--prod")
result = subprocess.run(command, cwd=root)
sys.exit(result.returncode)
