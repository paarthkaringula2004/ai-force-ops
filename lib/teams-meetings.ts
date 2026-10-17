import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { workspaceAccess } from "./workspace-access";
import { permitted } from "./workspace-permissions";
import { InputError } from "./eassist/transport";
import { encryptAgentApiKey as encrypt, decryptAgentApiKey as decrypt } from "./agent-secrets";

const scopes = "openid profile offline_access User.Read OnlineMeetings.ReadWrite";
const digest = (value: string) => createHash("sha256").update(value).digest("base64url");
async function config() {
    const saved = (
        await db.query(
            "SELECT tenant_id,client_id,client_secret FROM teams_app_settings WHERE singleton=true",
        )
    ).rows[0];
    const tenant = saved?.tenant_id || process.env.TEAMS_TENANT_ID?.trim() || "organizations";
    if (
        !/^(organizations|[a-zA-Z0-9.-]+)$/.test(tenant) ||
        ["common", "consumers"].includes(tenant)
    )
        throw new InputError("Teams must use a work or school tenant.", 503);
    const appUrl =
        process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return {
        tenant,
        clientId: saved?.client_id || process.env.TEAMS_CLIENT_ID?.trim() || "",
        secret: saved
            ? decrypt(saved.client_secret)
            : process.env.TEAMS_CLIENT_SECRET?.trim() || "",
        redirect:
            process.env.TEAMS_REDIRECT_URI?.trim() ||
            new URL("/api/teams/callback", appUrl).toString(),
    };
}
export async function teamsConfigured() {
    const c = await config();
    return !!(c.clientId && c.secret && c.redirect && process.env.BETTER_AUTH_SECRET);
}
const fingerprint = (c: Awaited<ReturnType<typeof config>>) =>
    digest(JSON.stringify([c.tenant, c.clientId, c.secret, c.redirect]));
async function active(user: string) {
    const member = await workspaceAccess(user);
    if (!permitted(member, "signed_in"))
        throw new InputError("Active workspace access required.", 403);
    return member;
}
export async function teamsConnectionStatus(user: string) {
    const member = await active(user);
    const settings = await config(),
        configured = !!(
            settings.clientId &&
            settings.secret &&
            settings.redirect &&
            process.env.BETTER_AUTH_SECRET
        );
    const row = (
        await db.query(
            'SELECT microsoft_id AS "microsoftId",account_name AS name,account_email AS email,updated_at AS "connectedAt" FROM teams_user_connections WHERE user_id=$1 AND app_fingerprint=$2',
            [user, fingerprint(settings)],
        )
    ).rows[0];
    return {
        configured,
        connected: !!row,
        account: row || null,
        provider: "Microsoft Teams",
        supportedAccount: "work_or_school",
        setup:
            member.role === "admin"
                ? {
                      redirectUri: settings.redirect,
                      clientId: settings.clientId,
                      tenantId: settings.tenant,
                      canConfigure: true,
                  }
                : null,
        reason: !configured
            ? "An Admin must configure the Microsoft Entra application before you can connect Teams."
            : !row
              ? "Sign in with your Teams work or school account to create meetings."
              : "Teams account connected. Meeting creation still requires Microsoft permission and Teams eligibility.",
    };
}
export async function beginTeamsSignIn(user: string) {
    await active(user);
    if (!(await teamsConfigured()))
        throw new InputError("Microsoft Teams app credentials have not been configured.", 503);
    const c = await config(),
        state = randomBytes(32).toString("base64url"),
        verifier = randomBytes(48).toString("base64url");
    await db.query("DELETE FROM teams_oauth_states WHERE expires_at<now()");
    await db.query(
        "INSERT INTO teams_oauth_states(state_hash,user_id,verifier,app_fingerprint) VALUES($1,$2,$3,$4)",
        [digest(state), user, encrypt(verifier), fingerprint(c)],
    );
    const url = new URL(`https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/authorize`);
    url.search = new URLSearchParams({
        client_id: c.clientId,
        redirect_uri: c.redirect,
        response_type: "code",
        response_mode: "query",
        scope: scopes,
        state,
        code_challenge: digest(verifier),
        code_challenge_method: "S256",
        prompt: "select_account",
    }).toString();
    return { state, url: url.toString() };
}
async function tokenRequest(body: Record<string, string>, c?: Awaited<ReturnType<typeof config>>) {
    c = c || (await config());
    const response = await fetch(
        `https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/token`,
        {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: c.clientId, client_secret: c.secret, ...body }),
            signal: AbortSignal.timeout(20000),
            redirect: "error",
        },
    );
    const result = await response.json();
    if (
        !response.ok ||
        typeof result.access_token !== "string" ||
        !Number.isFinite(Number(result.expires_in))
    )
        throw new InputError(
            "Teams sign-in or token renewal failed. Reconnect your work or school account.",
            409,
        );
    if (
        !String(result.scope || "")
            .split(" ")
            .some(
                (scope: string) =>
                    scope === "OnlineMeetings.ReadWrite" ||
                    scope.endsWith("/OnlineMeetings.ReadWrite"),
            )
    )
        throw new InputError(
            "Microsoft did not grant meeting creation permission. Ask your Teams administrator for consent.",
            403,
        );
    return result;
}
export async function finishTeamsSignIn(user: string, state: string, code: string) {
    await active(user);
    if (
        !(await teamsConfigured()) ||
        !/^[A-Za-z0-9_-]{43}$/.test(state) ||
        !code ||
        code.length > 8192
    )
        throw new InputError("Invalid Teams sign-in response.");
    const c = await config();
    const saved = (
        await db.query(
            "DELETE FROM teams_oauth_states WHERE state_hash=$1 AND user_id=$2 AND expires_at>now() RETURNING verifier,app_fingerprint",
            [digest(state), user],
        )
    ).rows[0];
    if (!saved)
        throw new InputError("Teams sign-in expired or was already used. Start again.", 409);
    if (saved.app_fingerprint !== fingerprint(c))
        throw new InputError("Teams application settings changed. Start sign-in again.", 409);
    const result = await tokenRequest(
        {
            grant_type: "authorization_code",
            code,
            redirect_uri: c.redirect,
            code_verifier: decrypt(saved.verifier),
        },
        c,
    );
    if (typeof result.refresh_token !== "string")
        throw new InputError("Microsoft did not grant offline access. Reconnect Teams.", 409);
    const profileResponse = await fetch(
        "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
        {
            headers: { Authorization: `Bearer ${result.access_token}` },
            signal: AbortSignal.timeout(15000),
            redirect: "error",
        },
    );
    const profile = await profileResponse.json();
    if (!profileResponse.ok || typeof profile.id !== "string")
        throw new InputError("Could not verify your Microsoft account.", 409);
    if (fingerprint(await config()) !== fingerprint(c))
        throw new InputError("Teams application settings changed. Start sign-in again.", 409);
    await db.query(
        `INSERT INTO teams_user_connections(user_id,microsoft_id,account_name,account_email,access_token,refresh_token,expires_at,scopes,app_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id) DO UPDATE SET microsoft_id=excluded.microsoft_id,account_name=excluded.account_name,account_email=excluded.account_email,access_token=excluded.access_token,refresh_token=excluded.refresh_token,expires_at=excluded.expires_at,scopes=excluded.scopes,app_fingerprint=excluded.app_fingerprint,updated_at=now()`,
        [
            user,
            profile.id,
            String(profile.displayName || "Teams account"),
            String(profile.mail || profile.userPrincipalName || ""),
            encrypt(result.access_token),
            encrypt(result.refresh_token),
            new Date(Date.now() + Number(result.expires_in) * 1000),
            String(result.scope),
            fingerprint(c),
        ],
    );
}
export async function disconnectTeams(user: string) {
    await active(user);
    await db.query("DELETE FROM teams_user_connections WHERE user_id=$1", [user]);
    await db.query("DELETE FROM teams_oauth_states WHERE user_id=$1", [user]);
    return { disconnected: true };
}
async function accessToken(user: string, expectedMicrosoftId?: string) {
    await active(user);
    if (!(await teamsConfigured()))
        throw new InputError("Configure the Microsoft Teams application first.", 503);
    const c = await config();
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const row = (
            await client.query("SELECT * FROM teams_user_connections WHERE user_id=$1 FOR UPDATE", [
                user,
            ])
        ).rows[0];
        if (!row) throw new InputError("Sign in to Teams before creating a meeting.", 409);
        if (row.app_fingerprint !== fingerprint(c))
            throw new InputError("Teams app settings changed. Reconnect your account.", 409);
        if (expectedMicrosoftId && row.microsoft_id !== expectedMicrosoftId)
            throw new InputError(
                "Reconnect the Microsoft account that originally organised this meeting.",
                409,
            );
        let token = decrypt(row.access_token);
        if (new Date(row.expires_at).getTime() < Date.now() + 90000) {
            const renewed = await tokenRequest(
                {
                    grant_type: "refresh_token",
                    refresh_token: decrypt(row.refresh_token),
                    scope: scopes,
                },
                c,
            );
            token = renewed.access_token;
            await client.query(
                "UPDATE teams_user_connections SET access_token=$2,refresh_token=$3,expires_at=$4,scopes=$5,updated_at=now() WHERE user_id=$1",
                [
                    user,
                    encrypt(token),
                    encrypt(renewed.refresh_token || decrypt(row.refresh_token)),
                    new Date(Date.now() + Number(renewed.expires_in) * 1000),
                    String(renewed.scope),
                ],
            );
        }
        await client.query("COMMIT");
        return token;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
export function verifiedTeamsUrl(value: unknown) {
    if (typeof value !== "string" || value.length > 4096)
        throw new InputError("Microsoft did not return a valid Teams meeting link.", 502);
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new InputError("Invalid Teams meeting link.", 502);
    }
    if (
        url.protocol !== "https:" ||
        !["teams.microsoft.com", "teams.live.com"].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.port
    )
        throw new InputError("Invalid Teams meeting link.", 502);
    return url.toString();
}
export async function createTeamsMeeting(
    user: string,
    meeting: { id: string; title: string; start: string; end: string; microsoftId?: string },
) {
    const token = await accessToken(user, meeting.microsoftId);
    const response = await fetch("https://graph.microsoft.com/v1.0/me/onlineMeetings/createOrGet", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            externalId: `aiforce:${meeting.id}`,
            subject: meeting.title,
            startDateTime: meeting.start,
            endDateTime: meeting.end,
        }),
        signal: AbortSignal.timeout(20000),
        redirect: "error",
    });
    const result = await response.json();
    if (!response.ok)
        throw new InputError(
            response.status === 403
                ? "Your Microsoft account cannot create Teams meetings. Check Teams licensing and app consent with your IT administrator."
                : "Teams could not create this meeting. Retry the same saved meeting; no invitation has been sent.",
            response.status === 403 ? 403 : 502,
        );
    if (typeof result.id !== "string")
        throw new InputError(
            "Teams returned incomplete meeting details. Retry this saved meeting.",
            502,
        );
    return {
        providerId: result.id,
        joinUrl: verifiedTeamsUrl(result.joinWebUrl),
        meetingId:
            typeof result.joinMeetingIdSettings?.joinMeetingId === "string"
                ? result.joinMeetingIdSettings.joinMeetingId
                : null,
        passcode:
            typeof result.joinMeetingIdSettings?.passcode === "string"
                ? result.joinMeetingIdSettings.passcode
                : null,
    };
}
export async function cancelTeamsMeeting(user: string, providerId: string, microsoftId?: string) {
    const token = await accessToken(user, microsoftId);
    const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/onlineMeetings/${encodeURIComponent(providerId)}`,
        {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(20000),
            redirect: "error",
        },
    );
    if (!response.ok && response.status !== 404)
        throw new InputError(
            "Teams could not cancel this meeting. Reconnect if necessary and retry.",
            502,
        );
}

export async function configureTeamsApp(user: string, value: unknown) {
    const member = await workspaceAccess(user);
    if (!permitted(member, "admin"))
        throw new InputError("Only an active Admin can configure the Teams application.", 403);
    const body = value as { clientId?: unknown; tenantId?: unknown; clientSecret?: unknown };
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
        !body ||
        typeof body.clientId !== "string" ||
        !guid.test(body.clientId.trim()) ||
        typeof body.tenantId !== "string" ||
        !guid.test(body.tenantId.trim()) ||
        typeof body.clientSecret !== "string" ||
        !body.clientSecret.trim() ||
        body.clientSecret.length > 4096
    )
        throw new InputError(
            "Enter the Entra application ID, directory tenant ID and client secret value.",
        );
    if (!process.env.BETTER_AUTH_SECRET)
        throw new InputError("Application encryption is unavailable.", 503);
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const current = (
            await client.query(
                "SELECT role,active FROM workspace_members WHERE user_id=$1 FOR SHARE",
                [user],
            )
        ).rows[0];
        if (!current?.active || current.role !== "admin")
            throw new InputError("Admin access changed. Refresh first.", 403);
        await client.query(
            "INSERT INTO teams_app_settings(singleton,tenant_id,client_id,client_secret,updated_by) VALUES(true,$1,$2,$3,$4) ON CONFLICT(singleton) DO UPDATE SET tenant_id=excluded.tenant_id,client_id=excluded.client_id,client_secret=excluded.client_secret,updated_by=excluded.updated_by,updated_at=now()",
            [body.tenantId.trim(), body.clientId.trim(), encrypt(body.clientSecret.trim()), user],
        );
        await client.query("DELETE FROM teams_user_connections");
        await client.query("DELETE FROM teams_oauth_states");
        await client.query("COMMIT");
        return { configured: true, reconnectRequired: true };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
