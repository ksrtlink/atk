import { createRemoteJWKSet, jwtVerify } from 'jose';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export async function verifyFirebaseToken(token, env, keyResolver = keys) {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_API_KEY) throw new Error('Authentication has not been configured.');
  const { payload } = await jwtVerify(token, keyResolver, {
    algorithms: ['RS256'], audience: env.FIREBASE_PROJECT_ID,
    issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
    requiredClaims: ['sub','exp','iat','auth_time'], clockTolerance: 5
  });
  const now = Math.floor(Date.now()/1000);
  if (typeof payload.sub !== 'string' || !payload.sub.length || payload.sub.length > 128 ||
      !Number.isFinite(payload.auth_time) || payload.auth_time > now+5 || payload.iat > now+5 ||
      typeof payload.email !== 'string' || !payload.email.includes('@')) throw new Error('Invalid account identity.');
  return { uid: payload.sub, email: payload.email.toLowerCase(), verified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name.slice(0,100) : '' };
}
