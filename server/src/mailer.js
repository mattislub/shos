const net = require("net");
const tls = require("tls");

const parseBoolean = (value) => {
  if (typeof value !== "string") {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = parseBoolean(process.env.SMTP_SECURE) || smtpPort === 465;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM;
const smtpTo = process.env.SMTP_TO_ORDER_NOTIFICATIONS;
const smtpTimeoutMs = Number(process.env.SMTP_TIMEOUT_MS || 10000);

const hasSmtpConfig = () => {
  return Boolean(smtpHost && smtpUser && smtpPass && smtpFrom && smtpTo);
};

const encodeBase64 = (value) => Buffer.from(String(value), "utf8").toString("base64");

const normalizeLine = (value = "") => String(value).replace(/[\r\n]+/g, " ").trim();

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildStyledEmail = ({ title, subtitle, accentColor = "#a855f7", bodyContent }) => {
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f6f3ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2937;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ff;padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:18px;border:1px solid #e9ddff;overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(135deg,${accentColor},#7c3aed);padding:24px 28px;color:#ffffff;">
                <div style="font-size:14px;opacity:0.9;letter-spacing:0.8px;text-transform:uppercase;">Shos</div>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3;">${escapeHtml(title)}</h1>
                <p style="margin:10px 0 0;font-size:15px;line-height:1.5;opacity:0.95;">${escapeHtml(subtitle)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">${bodyContent}</td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;font-size:13px;color:#6b7280;line-height:1.6;">
                Need help? Reply to this email and our team will assist you.<br />
                <strong style="color:#4b5563;">Shos Team</strong>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const waitForResponse = (socket, expectedCodes) => {
  return new Promise((resolve, reject) => {
    let buffer = "";

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      socket.setTimeout(0);
      socket.off("timeout", onTimeout);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("SMTP socket closed unexpectedly"));
    };

    const onTimeout = () => {
      cleanup();
      reject(new Error("SMTP response timeout"));
    };

    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line) {
          continue;
        }

        const code = line.slice(0, 3);
        const separator = line[3];
        if (separator === "-") {
          continue;
        }

        cleanup();
        if (!expectedCodes.includes(code)) {
          return reject(new Error(`SMTP unexpected response (${line})`));
        }

        return resolve(line);
      }
    };

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
    socket.setTimeout(smtpTimeoutMs, onTimeout);
  });
};

const sendCommand = async (socket, command, expectedCodes) => {
  socket.write(`${command}\r\n`);
  return waitForResponse(socket, expectedCodes);
};

const connectSocket = () => {
  return new Promise((resolve, reject) => {
    const onConnect = () => resolve(socket);
    const onError = (error) => reject(error);

    const socket = smtpSecure
      ? tls.connect(
          {
            host: smtpHost,
            port: smtpPort,
            servername: smtpHost,
            rejectUnauthorized: true
          },
          onConnect
        )
      : net.connect({ host: smtpHost, port: smtpPort }, onConnect);

    socket.setEncoding("utf8");
    socket.once("error", onError);

    socket.once("connect", () => {
      socket.off("error", onError);
    });
  });
};

const sendEmail = async ({ to, subject, textBody, htmlBody }) => {
  if (!hasSmtpConfig()) {
    return { sent: false, skipped: true, reason: "SMTP is not configured" };
  }

  const socket = await connectSocket();

  const fromValue = normalizeLine(smtpFrom);
  const toValue = normalizeLine(to);
  const subjectValue = normalizeLine(subject);

  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const hasHtmlBody = Boolean(htmlBody);

  const messageHeaders = [
    `From: ${fromValue}`,
    `To: ${toValue}`,
    `Subject: =?UTF-8?B?${encodeBase64(subjectValue)}?=`,
    `MIME-Version: 1.0`,
    hasHtmlBody
      ? `Content-Type: multipart/alternative; boundary="${boundary}"`
      : `Content-Type: text/plain; charset=UTF-8`,
    hasHtmlBody ? "" : `Content-Transfer-Encoding: 8bit`
  ];

  const messageBody = hasHtmlBody
    ? [
        "",
        `--${boundary}`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: 8bit`,
        "",
        textBody,
        "",
        `--${boundary}`,
        `Content-Type: text/html; charset=UTF-8`,
        `Content-Transfer-Encoding: 8bit`,
        "",
        htmlBody,
        "",
        `--${boundary}--`,
        ""
      ]
    : ["", textBody, ""];

  const message = [...messageHeaders, ...messageBody].join("\r\n");

  try {
    await waitForResponse(socket, ["220"]);
    await sendCommand(socket, `EHLO localhost`, ["250"]);
    await sendCommand(socket, `AUTH LOGIN`, ["334"]);
    await sendCommand(socket, encodeBase64(smtpUser), ["334"]);
    await sendCommand(socket, encodeBase64(smtpPass), ["235"]);
    await sendCommand(socket, `MAIL FROM:<${fromValue}>`, ["250"]);
    await sendCommand(socket, `RCPT TO:<${toValue}>`, ["250", "251"]);
    await sendCommand(socket, `DATA`, ["354"]);
    socket.write(`${message}\r\n.\r\n`);
    await waitForResponse(socket, ["250"]);
    await sendCommand(socket, `QUIT`, ["221"]);
    socket.end();
    return { sent: true, skipped: false };
  } catch (error) {
    socket.destroy();
    throw error;
  }
};

const sendOrderNotificationEmail = async ({
  orderId,
  customerName,
  phone,
  quantity,
  productTitle,
  createdAt
}) => {
  const createdAtText = createdAt ? new Date(createdAt).toLocaleString("en-US") : "";

  const textBody = [
    "A new order was placed on the website.",
    `Order ID: ${orderId}`,
    `Product: ${normalizeLine(productTitle)}`,
    `Customer Name: ${normalizeLine(customerName)}`,
    `Phone: ${normalizeLine(phone)}`,
    `Quantity: ${quantity}`,
    `Created At: ${normalizeLine(createdAtText)}`
  ].join("\n");

  return sendEmail({
    to: smtpTo,
    subject: `New Order #${orderId}`,
    textBody
  });
};

const sendCustomerLoginCodeEmail = async ({
  customerEmail,
  code,
  expiresInMinutes
}) => {
  const safeCode = escapeHtml(normalizeLine(code));
  const textBody = [
    "Your Shos login code is:",
    "",
    `${normalizeLine(code)}`,
    "",
    `The code is valid for ${expiresInMinutes} minutes.`,
    "If you did not request this code, you can ignore this email.",
    "",
    "Shos Team"
  ].join("\n");

  return sendEmail({
    to: customerEmail,
    subject: "Your 6-digit login code",
    textBody,
    htmlBody: buildStyledEmail({
      title: "Your login code",
      subtitle: "Use this one-time code to sign in securely.",
      bodyContent: `
        <p style="margin:0 0 16px;font-size:16px;">Enter this code to continue:</p>
        <div style="display:inline-block;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:14px 18px;font-size:34px;letter-spacing:8px;font-weight:700;color:#5b21b6;">${safeCode}</div>
        <p style="margin:18px 0 0;font-size:14px;color:#4b5563;">This code is valid for <strong>${Number(expiresInMinutes) || expiresInMinutes} minutes</strong>.</p>
        <p style="margin:10px 0 0;font-size:14px;color:#6b7280;">If you didn’t request this code, you can safely ignore this email.</p>
      `
    })
  });
};

const sendCustomerOrderConfirmationEmail = async ({
  orderId,
  customerName,
  customerEmail,
  quantity,
  productTitle
}) => {
  const safeCustomerName = escapeHtml(normalizeLine(customerName));
  const safeProductTitle = escapeHtml(normalizeLine(productTitle));
  const textBody = [
    `Hi ${normalizeLine(customerName)},`,
    "",
    "Thank you for your order!",
    "We have received your order and will contact you shortly.",
    "",
    `Order ID: ${orderId}`,
    `Product: ${normalizeLine(productTitle)}`,
    `Quantity: ${quantity}`,
    "",
    "Best regards,",
    "Shos Team"
  ].join("\n");

  return sendEmail({
    to: customerEmail,
    subject: `Order Confirmation #${orderId}`,
    textBody,
    htmlBody: buildStyledEmail({
      title: "Order confirmed",
      subtitle: "Thanks for your order. We received it successfully.",
      accentColor: "#ec4899",
      bodyContent: `
        <p style="margin:0 0 14px;font-size:16px;">Hi <strong>${safeCustomerName || "there"}</strong>, your order is now in our system.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff7fb;border:1px solid #fbcfe8;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:12px 14px;font-size:14px;color:#9d174d;border-bottom:1px solid #fbcfe8;">Order ID</td>
            <td style="padding:12px 14px;font-size:14px;color:#831843;border-bottom:1px solid #fbcfe8;font-weight:600;">#${escapeHtml(orderId)}</td>
          </tr>
          <tr>
            <td style="padding:12px 14px;font-size:14px;color:#9d174d;border-bottom:1px solid #fbcfe8;">Product</td>
            <td style="padding:12px 14px;font-size:14px;color:#831843;border-bottom:1px solid #fbcfe8;">${safeProductTitle}</td>
          </tr>
          <tr>
            <td style="padding:12px 14px;font-size:14px;color:#9d174d;">Quantity</td>
            <td style="padding:12px 14px;font-size:14px;color:#831843;">${escapeHtml(quantity)}</td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:14px;color:#4b5563;">We’ll contact you shortly with next steps.</p>
      `
    })
  });
};

module.exports = {
  hasSmtpConfig,
  sendOrderNotificationEmail,
  sendCustomerOrderConfirmationEmail,
  sendCustomerLoginCodeEmail
};
