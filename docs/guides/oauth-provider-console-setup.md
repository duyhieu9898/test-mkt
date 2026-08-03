# OAuth Provider Console Setup

This guide explains how to create or replace the shared OAuth applications used
by 1Person for Meta, Google Drive, and Microsoft OneDrive.

It is intended for developers and deployment operators. End users should only
see a **Connect** button in 1Person and authorize their own account.

## 1. How credentials and user accounts are separated

The values below identify the 1Person SaaS application:

- `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`

They do not identify the customer who connects a Facebook Page, Google Drive,
or OneDrive account. Each customer completes OAuth with their own account.
1Person stores the resulting access and refresh tokens per
`companyId + userId + provider` in `oauth_integrations` or the platform-specific
connection table.

OAuth tokens are encrypted at rest with the key derived from `JWT_SECRET`.
Do not rotate `JWT_SECRET` without a token re-encryption plan. Existing OAuth
tokens cannot be decrypted after an unplanned rotation.

## 2. URLs to decide before opening a provider console

The API builds OAuth callbacks from `NEXT_PUBLIC_API_URL`. Keep `/api/v1` in the
value and do not add a trailing slash.

```env
# Local
NEXT_PUBLIC_API_URL=http://localhost:8004/api/v1
WEB_URL=http://localhost:3004

# Production example
NEXT_PUBLIC_API_URL=https://1person.example.com/api/v1
WEB_URL=https://1person.example.com
```

Register these exact callback URLs in the provider consoles:

| Provider | Callback path | Production example |
| --- | --- | --- |
| Meta Page OAuth | `/omnichannel/facebook/oauth/callback` | `https://1person.example.com/api/v1/omnichannel/facebook/oauth/callback` |
| Google Drive | `/integrations/google_drive/callback` | `https://1person.example.com/api/v1/integrations/google_drive/callback` |
| Google Search Console and GA4 (optional) | `/integrations/google/callback` | `https://1person.example.com/api/v1/integrations/google/callback` |
| Microsoft OneDrive | `/integrations/onedrive/callback` | `https://1person.example.com/api/v1/integrations/onedrive/callback` |

OAuth providers compare redirect URIs exactly. Scheme, host, port, path, and
trailing slash must match the URL sent by the API.

Production callbacks must use public HTTPS. Localhost can be registered as a
separate development callback where the provider allows it. Otherwise, use a
stable HTTPS development tunnel and update both `NEXT_PUBLIC_API_URL` and the
provider console.

## 3. Meta: connect and publish to a Facebook Page

### Current 1Person use case

The active Channels flow lets a user log in, choose a Page they manage, and
publish Campaign social posts to that Page. It requests only:

| Permission | Why 1Person needs it |
| --- | --- |
| `pages_show_list` | Show Pages available to the signed-in user. |
| `pages_read_engagement` | Validate Page access and read Page/post data needed by publishing and performance sync. |
| `pages_manage_posts` | Create Page posts from a Campaign. |

Do not add Ads or Messenger permissions to this review unless the corresponding
feature is being released and demonstrated. Smaller permission requests are
easier to review and safer for customers.

### Create the Meta app

1. Open [Meta for Developers](https://developers.facebook.com/apps/) and create
   an app owned by the production business portfolio.
2. Add the Page-management use case. In the current Meta UI this is commonly
   shown as **Manage everything on your Page**.
3. Add **Facebook Login for Business** if it is not added automatically.
4. In **App settings > Basic**, complete the app name, contact email, app domain,
   privacy policy URL, terms URL, data deletion URL/instructions, category, and
   app icon.
5. In Facebook Login settings, enable **Client OAuth Login** and **Web OAuth
   Login**.
6. Add the exact Meta callback URL from section 2 to **Valid OAuth Redirect
   URIs**.
7. In the Page use case's **Permissions and features**, add
   `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`.

Meta changes dashboard labels periodically. The important result is that the
three permissions belong to the Page use case and the callback appears in the
login product's valid redirect list.

### Testing versus public access

- **Development/demo:** add people under **App roles** as Administrators,
  Developers, or Testers. A tester must accept the invitation. The Facebook
  account must also have sufficient control over the Page it selects.
- **Production:** switch the app to Live and submit the three permissions for
  App Review/Advanced Access. **Ready for testing** or **Added to App Review**
  does not mean the permission is approved for public users.
- Meta may require business verification before granting Advanced Access. This
  is controlled by Meta and cannot be bypassed in application code.

For each reviewed permission, provide a test account, reproducible steps, and a
screen recording that shows the user connecting a Page and publishing a post
through 1Person.

### Configure 1Person

Copy the app ID and app secret from **App settings > Basic**:

```env
FACEBOOK_APP_ID=your_meta_app_id
FACEBOOK_APP_SECRET=your_meta_app_secret
```

Restart the API after changing these values. The canonical variables are the
`FACEBOOK_APP_*` names above. Some legacy platform providers still recognize
`FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`, but new deployments should not
depend on those aliases.

### Optional Messenger webhook

Organic Page publishing does not require a Messenger webhook. If inbound
Messenger is enabled later, route this public URL to the API:

```text
https://1person.example.com/webhooks/omnichannel/messenger
```

Messenger needs its own webhook subscription, Page subscription, review, and
permissions such as `pages_manage_metadata` and `pages_messaging`. Keep that
review separate from the basic Page publishing setup.

## 4. Google Drive: per-file access with Google Picker

### Current 1Person use case

1Person uses Google Picker with the narrow `drive.file` scope. The user chooses
specific files; 1Person does not request access to the user's entire Drive.

The complete Drive connection may request:

```text
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

The one-file Picker flow requests only `drive.file`.

### Create the Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or
   create the production project.
2. Open **APIs & Services > Library** and enable **Google Drive API**.
3. Open **Google Auth Platform > Branding** and complete the app name, support
   email, logo, homepage, privacy policy, terms, and authorized domains.
4. Open **Audience** and choose **External** for a SaaS product used by customer
   Google accounts.
5. Open **Data Access** and add the three scopes listed above.
6. Open **Clients**, create an OAuth client of type **Web application**, and add
   the exact Google Drive callback from section 2 under **Authorized redirect
   URIs**.
7. While the app is in Testing, add developer/customer accounts under **Test
   users**. Before broad production use, publish the app and complete any
   verification requested by Google.

`drive.file` is a non-sensitive, per-file scope and is the intended scope for
Google Picker. Do not replace it with broad `drive` or `drive.readonly` access
unless product requirements and verification have been reviewed.

### Configure 1Person

Copy the Web application's client ID and client secret:

```env
GOOGLE_CLIENT_ID=your_google_web_client_id
GOOGLE_CLIENT_SECRET=your_google_web_client_secret
```

The OAuth client must be a **Web application** client. Android, iOS, desktop,
and API-key credentials cannot replace these two values.

### Optional Search Console and GA4 connection

The SEO/analytics connection reuses the same Google client but has a different
callback and requests:

```text
https://www.googleapis.com/auth/webmasters.readonly
https://www.googleapis.com/auth/analytics.readonly
```

Enable the relevant Google APIs, add these scopes to Data Access, and register
the optional callback from section 2 only when this feature is deployed. These
scopes can add verification requirements beyond the Drive Picker setup.

## 5. Microsoft OneDrive: multi-tenant delegated access

### Current 1Person use case

1Person uses the OAuth authorization-code flow and Microsoft Graph delegated
permissions:

| Permission | Type | Why 1Person needs it |
| --- | --- | --- |
| `User.Read` | Delegated | Identify the connected Microsoft account. |
| `Files.Read` | Delegated | Let the signed-in user browse and choose their files. |
| `offline_access` | OAuth scope | Obtain a refresh token for later access. |

The app does not need application-level `Files.Read.All` for the current flow.

### Create the Microsoft app registration

1. Open [Microsoft Entra admin center](https://entra.microsoft.com/), then go to
   **Identity > Applications > App registrations > New registration**.
2. Select **Accounts in any organizational directory and personal Microsoft
   accounts**. The Azure UI may label this **Any Entra ID Tenant + Personal
   Microsoft accounts**.
3. Under **Authentication**, add a **Web** platform and enter the exact OneDrive
   callback URL from section 2.
4. Under **API permissions**, add Microsoft Graph **Delegated permissions**:
   `User.Read` and `Files.Read`. The runtime also requests `offline_access`.
5. Under **Certificates & secrets**, create a client secret. Copy the secret
   **Value** immediately; the Secret ID is not the client secret.
6. Complete publisher/domain information for production trust. Record the
   secret expiry date and rotate it before expiration.

For the supported multi-tenant account type, use the `common` authority:

```env
MICROSOFT_TENANT_ID=common
MICROSOFT_CLIENT_ID=your_application_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret_value
```

An organization's Entra tenant can disable user consent even for delegated
permissions. In that case, the customer sees **Need admin approval** and their
tenant administrator must grant consent. Changing `MICROSOFT_TENANT_ID` or code
cannot override the customer's tenant policy.

Use a specific tenant ID only for a deliberate single-tenant deployment. Using
one tenant ID in a public SaaS deployment prevents users from other tenants or
personal Microsoft accounts from connecting.

## 6. Replacing an existing app ID or secret

Treat an OAuth app replacement as a credential migration, not a simple text
edit.

1. Create/configure the replacement app while the old app still works.
2. Register all local, staging, and production callbacks on the replacement.
3. Configure the minimum scopes and complete testing/review requirements.
4. Update only the server-side environment values.
5. Restart the API. Rebuild the web app only when a `NEXT_PUBLIC_*` value also
   changed.
6. If the client ID or Meta app ID changed, reconnect every existing provider
   connection in the 1Person UI.
7. Run the smoke tests below.
8. Keep the old app/secret available for a short rollback window, then revoke
   it after all required connections have moved.

Refresh tokens and Page tokens are tied to the OAuth client/app that issued
them. They cannot be copied to a replacement client ID or Meta app ID. A secret
rotation that keeps the same client/app ID normally preserves existing tokens,
but the refresh and publish flows must still be tested before the old secret is
revoked.

## 7. Smoke-test checklist

### Meta

1. Open the company **Channels** page.
2. Connect Facebook with a user who manages at least one Page.
3. Confirm the Page picker shows only Pages available to that user.
4. Publish one Campaign Facebook post and open the returned Facebook URL.
5. Run Campaign performance sync and confirm the connection is still valid.

### Google Drive

1. Open company **Settings** or a Campaign source picker.
2. Connect a Google account that is not the app owner's account.
3. Choose one permitted file in Picker.
4. Confirm 1Person can read that file but does not require broad Drive access.
5. Disconnect and reconnect once to verify the refresh-token flow.

### OneDrive

1. Connect both a personal Microsoft account and, when available, a work/school
   account from another tenant.
2. Browse/search files and select one supported file.
3. Confirm the file can be read after the initial access token expires or after
   reconnecting the API process.
4. If a work tenant blocks consent, record that admin consent is required rather
   than changing the app to single tenant.

## 8. Common errors

| Error | Likely cause | Fix |
| --- | --- | --- |
| `redirect_uri_mismatch`, `invalid_request`, or Meta `URL Blocked` | Console callback differs from the API-generated URL. | Compare the OAuth request's `redirect_uri` with section 2 character by character. Restart the API after changing `NEXT_PUBLIC_API_URL`. |
| Google `403 access_denied` / app not verified | App is in Testing and the account is not a test user, or production verification is incomplete. | Add a test user for development or publish/verify the OAuth app. |
| Microsoft `Need admin approval` | The customer's tenant blocks user consent. | Ask that tenant's administrator to grant consent; do not request broader permissions. |
| Microsoft `invalid_client` | Wrong secret, expired secret, or Secret ID used instead of Value. | Create a new secret and copy its Value. |
| Meta `App not active` | App is in development or the user has no accepted app role. | Add/accept a tester role for demo, or complete review and switch Live for production. |
| Meta missing `pages_manage_posts` | Permission was not granted/approved, or the token predates approval. | Approve the permission, then disconnect and reconnect the Page. |
| Facebook Page list is empty | Signed-in Facebook user does not manage a Page or lacks sufficient Page task access. | Use an account with Page content/full-control permission. |
| Old public tunnel still appears in OAuth URL | The running API still has old environment values. | Update the API container/process environment and restart it. A browser-only `.env` change is insufficient. |
| Existing integrations fail after changing `JWT_SECRET` | Stored tokens can no longer be decrypted. | Restore the previous secret or implement token re-encryption; otherwise reconnect every integration. |

## 9. Security rules

- Never commit `.env`, app secrets, access tokens, or refresh tokens.
- Never prefix a provider secret with `NEXT_PUBLIC_`; that exposes it to the
  browser bundle.
- Store production secrets in the deployment secret store with least-privilege
  operator access.
- Use separate OAuth applications for local/staging and production when
  possible.
- Request the minimum scopes used by current code.
- Rotate client secrets before expiry, with an overlap window.
- Do not log authorization codes, access tokens, refresh tokens, or full OAuth
  callback query strings.

## 10. Code map

| Area | Source |
| --- | --- |
| Google Drive OAuth and token refresh | `apps/api/src/services/google-drive-auth.ts` |
| OneDrive OAuth and token refresh | `apps/api/src/services/onedrive-auth.ts` |
| Google/OneDrive callback routes | `apps/api/src/routes/integrations.ts` |
| Meta Page OAuth and Page selection | `apps/api/src/routes/omnichannel.ts` |
| Meta Graph provider and requested scopes | `apps/api/src/services/platforms/providers/facebook.ts` |
| Public Messenger webhook mount | `apps/api/src/index.ts` |
| User-level OAuth token schema | `packages/core/src/db/schema/oauth-integrations.ts` |
| Token encryption | `apps/api/src/lib/crypto.ts` |
| Drive source picker UI | `apps/web/src/components/marketing/drive-source-picker.tsx` |
| Facebook Channels API hooks | `apps/web/src/lib/api/channels-hooks.ts` |

## Official references

- [Google Drive OAuth scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google Picker integration](https://developers.google.com/workspace/drive/picker/guides/overview)
- [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Microsoft app registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Microsoft redirect URI configuration](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri)
- [Microsoft permissions and consent](https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview)
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Meta for Developers app dashboard](https://developers.facebook.com/apps/)
- [Meta permissions reference](https://developers.facebook.com/docs/permissions/)
- [Meta App Review](https://developers.facebook.com/docs/app-review/)

Last reviewed against the 1Person implementation: 2026-08-03.
