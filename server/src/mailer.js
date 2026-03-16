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

const sendEmail = async ({ to, subject, textBody }) => {
  if (!hasSmtpConfig()) {
    return { sent: false, skipped: true, reason: "SMTP is not configured" };
  }

  const socket = await connectSocket();

  const fromValue = normalizeLine(smtpFrom);
  const toValue = normalizeLine(to);
  const subjectValue = normalizeLine(subject);

  const message = [
    `From: ${fromValue}`,
    `To: ${toValue}`,
    `Subject: =?UTF-8?B?${encodeBase64(subjectValue)}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    "",
    textBody,
    ""
  ].join("\r\n");

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
    textBody
  });
};

const sendCustomerOrderConfirmationEmail = async ({
  orderId,
  customerName,
  customerEmail,
  quantity,
  productTitle
}) => {
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
    textBody
  });
};

module.exports = {
  hasSmtpConfig,
  sendOrderNotificationEmail,
  sendCustomerOrderConfirmationEmail,
  sendCustomerLoginCodeEmail
};
