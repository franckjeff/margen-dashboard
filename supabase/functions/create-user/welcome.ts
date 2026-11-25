// The welcome email a new user gets from the create-user function, with their sign-in email and temporary
// password. It looks like the other MARGEN emails (send-emails/templates.ts). It's sent straight away and never
// stored, so the password isn't kept anywhere; when they first sign in, the app makes them choose their own.

const escape = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function welcomeEmail({ firstName, email, password, appUrl }: { firstName: string; email: string; password: string; appUrl: string }) {
  const subject = "Welcome to the MARGEN Dashboard";
  const intro = [
    `Hello ${firstName},`,
    "An account has been created for you on the MARGEN Dashboard, where you can follow your custom orders.",
    "Sign in with the details below. You'll then be asked to choose your own password.",
  ];
  const rows: [string, string][] = [
    ["Email", email],
    ["Temporary password", password],
  ];
  const html = `<!doctype html><html><body style="margin:0;background:#f1f3f5;font-family:Segoe UI,Arial,sans-serif;color:#002138">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#002138;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:2px">MARGEN<span style="display:block;height:3px;width:40px;background:#7ef84d;margin-top:8px"></span></td></tr>
<tr><td style="padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${escape(subject)}</h1>
${intro.map((line) => `<p style="margin:0 0 10px;line-height:1.5">${escape(line)}</p>`).join("")}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 20px;border-collapse:collapse;width:100%">
${rows
  .map(
    ([label, value]) =>
      `<tr><td style="padding:6px 12px 6px 0;color:#4f6b79;white-space:nowrap;vertical-align:top">${escape(label)}</td><td style="padding:6px 0;font-weight:600;font-family:Consolas,Menlo,monospace">${escape(value)}</td></tr>`,
  )
  .join("")}
</table>
<a href="${escape(appUrl)}" style="display:inline-block;background:#002138;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:6px">Sign in</a>
<p style="margin:18px 0 0;line-height:1.5;color:#4f6b79;font-size:13px">If you weren't expecting this email, you can ignore it.</p>
</td></tr>
<tr><td style="padding:14px 24px;color:#4f6b79;font-size:12px;border-top:1px solid #dbe2e7">Sent automatically by the MARGEN Dashboard.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [subject, "", ...intro, "", ...rows.map(([label, value]) => `${label}: ${value}`), "", `Sign in: ${appUrl}`].join("\n");
  return { subject, html, text };
}
