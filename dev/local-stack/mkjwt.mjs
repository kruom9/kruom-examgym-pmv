// make HS256 JWTs for local dev (anon + service_role) from the local JWT secret
import crypto from "node:crypto";
const secret = process.argv[2];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (p) => { const h = b64({ alg: "HS256", typ: "JWT" }), b = b64(p);
  return h + "." + b + "." + crypto.createHmac("sha256", secret).update(h + "." + b).digest("base64url"); };
const exp = 1983812996;
console.log("ANON_KEY=" + sign({ iss: "supabase-local", role: "anon", exp }));
console.log("SERVICE_ROLE_KEY=" + sign({ iss: "supabase-local", role: "service_role", exp }));
