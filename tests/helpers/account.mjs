import { randomUUID } from "node:crypto";

export async function fixtureAccount(
    pool,
    { role = "admin", name = "Disposable Admin verification", base = "http://localhost:3000" } = {},
) {
    const password = randomUUID() + "Aa1!",
        email = "admin-verification-" + randomUUID() + "@example.invalid";
    const signup = await fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
        signal: AbortSignal.timeout(30000),
    });
    const created = await signup.json();
    if (!signup.ok) throw new Error("Fixture signup failed: " + JSON.stringify(created));
    const id = created.user.id;
    try {
        // Setup touches only the exact reserved test identity. Product verification
        // and authorization remain enabled and are tested separately.
        await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1 AND email=$2', [
            id,
            email,
        ]);
        await pool.query("UPDATE workspace_members SET role=$2 WHERE user_id=$1", [id, role]);
        const login = await fetch(base + "/api/auth/sign-in/email", {
            method: "POST",
            headers: { Origin: base, "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            signal: AbortSignal.timeout(30000),
        });
        if (!login.ok) throw new Error("Fixture login failed: " + (await login.text()));
        return {
            id,
            user: id,
            email,
            name,
            cookie: login.headers
                .getSetCookie()
                .map((value) => value.split(";")[0])
                .join("; "),
        };
    } catch (error) {
        await cleanupFixture(pool, { id, email });
        throw error;
    }
}
export async function cleanupFixture(pool, { id, email }) {
    if (!email?.endsWith("@example.invalid"))
        throw new Error("Refusing cleanup outside reserved fixture domain");
    await pool.query("DELETE FROM verification WHERE identifier=ANY($1::text[])", [
        ["email-verification-otp-" + email, "sign-in-otp-" + email, "forget-password-otp-" + email],
    ]);
    await pool.query("DELETE FROM organization_security_events WHERE actor_id=$1", [id]);
    await pool.query("DELETE FROM workspace_audit WHERE actor_id=$1 OR target_id=$1", [id]);
    await pool.query("DELETE FROM mail_outbox WHERE actor_id=$1 OR recipient=$2", [id, email]);
    await pool.query('DELETE FROM "user" WHERE id=$1 AND email=$2', [id, email]);
}
