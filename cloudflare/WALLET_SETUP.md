# Wallet setup and current gates

Google connection diagnostics are prepared. Pass issuance, stable issuance records, pass updates, provider approval and actual phone installation remain incomplete. No Add to Wallet button or unsigned pass has been added. No Apple membership or paid service was purchased. The existing Firebase project authenticates Tinytrail users; it does not establish a Google Wallet issuer.

## Google: one-time account setup

1. The account owner creates a Google Wallet issuer in the Google Pay & Wallet console and chooses the actual public issuer name. Review the provider terms personally; the app does not accept them on your behalf.
2. Enable Google Wallet API in the intended Google Cloud project. Create a service account for this integration and give it the documented Developer access in the Wallet issuer console. This does not require Google Workspace domain-wide delegation.
3. Create a Generic pass class and retain its public issuer/class identifiers. New issuers start in demo mode; add the intended tester accounts. Public distribution requires separate publishing approval.
4. Keep the downloaded service-account JSON outside this checkout and upload it through Cloudflare's secret mechanism as GOOGLE_WALLET_SERVICE_ACCOUNT. Do not put it in browser code, ordinary Wrangler vars, Git, chat, screenshots or exports. The public issuer ID/class ID may be shared to configure the integration. No private key is needed in chat.
5. Set GOOGLE_WALLET_MODE=demo, GOOGLE_WALLET_ISSUER_ID and GOOGLE_WALLET_CLASS_ID in the deployment configuration. Demo/live here describe intended configuration; they do not prove Google's publishing state. Keep the mode disabled until setup is actually available.

After secure credential setup, a verified platform administrator can POST /api/admin/wallet/google/check. Company and personal-workspace ownership do not confer this global diagnostic permission. The endpoint accepts no URL parameters or credential overrides. It returns disabled/not_configured/connection_failed/class_access_verified with a connected boolean and productionReady=false. Class access alone is not a launch gate, an issued pass or evidence of installation.

## Implemented connection boundary

The existing jose library imports a server-side PKCS8 RSA key (2048–4096 bits), signs a one-hour RS256 OAuth assertion for the Wallet issuer scope and exchanges it at the fixed Google token endpoint. A Bearer access token, never the raw private key, authenticates the fixed GenericClass GET. No user impersonation claim is created. Google signing-key IDs are bounded, service-account data is validated, arbitrary token URLs/foreign issuer classes are rejected, redirects are not followed and response streams are bounded and cancelled. An eight-second total network deadline and coarse error enums prevent credential/response-body disclosure. The private API is no-store. No provider object/class creation, update, notification, database migration or third-party transmission of profile fields occurs in this phase.

Missing configuration does not contact Google. Production and staging defaults remain disabled. Disabling GOOGLE_WALLET_MODE is sufficient to stop connection checks; remove/rotate a provisioned secret through the operator's approved Cloudflare secret process when needed. This phase introduces no new dependency or client bundle.

The registered tests verify the OAuth grant's exact audience/scope/claims, independent Node/OpenSSL-backed RSA signature verification, fixed hosts and request methods, absence of secrets in results, weak/invalid keys, missing setup, redirects/errors, malformed/oversized responses, timeout handling and verified platform-admin permissions. A temporary deployed Cloudflare probe generated a synthetic key in memory and signed the actual assertion; its public key/signature were independently verified with Node crypto. Provider responses in that probe were synthetic contract fixtures. It did not authenticate to a real Google issuer or validate pass creation, updates, publishing or Android installation.

## Apple: account and budget decision

Apple requires a Pass Type ID and its signing certificate, created by an Account Holder or Admin. Apple currently lists Developer Program membership at US$99/year; an existing eligible team membership may avoid a new enrollment. Confirm which account/team should issue Tinytrail passes before creating signing identities or paying for a membership. No signing key should be sent through chat or stored in the checkout.

After that setup, the remaining implementation must validate signing credentials, build signed pkpass packages, preserve stable serial numbers, implement authorized distribution and the authenticated device registration/update service, and verify push connectivity/certificate rotation in the actual runtime. Cloudflare has an outgoing mTLS binding, but its availability alone does not prove APNs transport compatibility. Verify the actual provider connection before promising automatic refresh. Apple Wallet remains unimplemented and unavailable until this work and actual iPhone installation/update tests pass.

## Remaining launch evidence

- Real issuer/account and authorized server-side credentials for each provider.
- Google object creation/update, stable identity, ownership checks and approved save flow; actual Android installation/update and disabled-profile behavior.
- Apple signing, registration/update/push flow and actual iPhone installation/update with the correct QR destination.
- Credential expiry/rotation/failure handling and emergency controls for the chosen issuer identities.
- Existing staff gates: actual iPhone/Android vCard import, supported email-client signature paste, meeting-app framing and physical print scanning.
- Contact exchange remains off pending its separate policy approval. CRM remains unselected and unconnected. Neither gate is silently waived by Wallet research.

## Primary references checked 20 October 2026 (Dubai)

- Google issuer onboarding: https://developers.google.com/wallet/generic/getting-started/issuer-onboarding
- Google credentials: https://developers.google.com/wallet/generic/getting-started/auth/rest
- OAuth assertions and Bearer authorization: https://developers.google.com/identity/protocols/oauth2/service-account
- Generic class read/scope: https://developers.google.com/wallet/reference/rest/v1/genericclass/get
- Google save flow: https://developers.google.com/wallet/generic/web
- Apple issuer identities: https://developer.apple.com/help/account/capabilities/create-wallet-identifiers-and-certificates
- Apple membership price: https://developer.apple.com/programs/whats-included/
- Cloudflare outgoing mTLS: https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/

Provider/device gates remain open. This document records setup facts and tested connection plumbing, not a completed Wallet integration.

129 registered tests and the build pass. Staging Worker 55877a52-2345-41ec-bc04-fd39ef6cfaea and production Worker 721f50f2-1578-4d59-8f54-c537d7cb9e8e deployed with Wallet mode absent (disabled default). No credentials or issuer account were provisioned. Anonymous diagnostic requests return 401; existing app assets match the prior verified build and contact collection remains disabled. The temporary native-signing probe was deleted. No database migration was required.
