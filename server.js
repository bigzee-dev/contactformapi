require("dotenv").config();

const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();

const PORT = process.env.PORT || 3000;

// Parse site configuration from .env
let siteConfig = {};

try {
  siteConfig = JSON.parse(process.env.SITE_CONFIG || "{}");
} catch (error) {
  console.error("Invalid SITE_CONFIG in .env");
  process.exit(1);
}

// Allowed origins
const allowedOrigins = Object.keys(siteConfig);

console.log("Allowed origins:");
console.log(allowedOrigins);

// CORS
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests without an Origin header
      // (useful for server-to-server requests)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
  }),
);

app.use(express.json());

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify SMTP connection when the server starts
transporter.verify((error) => {
  if (error) {
    console.error("SMTP connection failed:", error);
  } else {
    console.log("SMTP server is ready");
  }
});

// Contact form endpoint
app.post("/api/contact", async (req, res) => {
  try {
    /*
     * Get the Origin header from the request.
     *
     * Example:
     * Origin: https://deltaworx.co.bw
     */
    const origin = req.headers.origin;

    if (!origin) {
      return res.status(403).json({
        success: false,
        error: "Origin is required",
      });
    }

    /*
     * Check whether this origin is registered
     * in SITE_CONFIG.
     */
    if (!allowedOrigins.includes(origin)) {
      console.warn(`Blocked request from: ${origin}`);

      return res.status(403).json({
        success: false,
        error: "Origin not allowed",
      });
    }

    /*
     * Get the configuration for this website.
     */
    const site = siteConfig[origin];

    if (!site || !site.email) {
      return res.status(500).json({
        success: false,
        error: "No email destination configured for this site",
      });
    }

    /*
     * Get submitted form data.
     */
    const { name, email, phonenumber, message } = req.body;

    // Basic validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: "Name, email and message are required",
      });
    }

    /*
     * The phone number is optional on the frontend, so it may be
     * missing, null or an empty string. Only include it in the email
     * when a value was actually submitted.
     */
    const phone = typeof phonenumber === "string" ? phonenumber.trim() : "";

    const hasPhone = phone.length > 0;

    const phoneTextLine = hasPhone ? `\nPhone: ${phone}` : "";

    /*
     * Send email.
     */
    await transporter.sendMail({
      from: process.env.SMTP_FROM,

      // This is determined by the registered website,
      // NOT by the visitor submitting the form.
      to: site.email,

      // Visitor's email goes into Reply-To
      replyTo: email,

      subject: `New contact form submission from ${origin}`,

      text: `
Name: ${name}
Email: ${email}${phoneTextLine}
Website: ${origin}

Message:
${message}
            `.trim(),

      html: `
                <h2>New Contact Form Submission</h2>

                <p><strong>Website:</strong> ${origin}</p>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                ${hasPhone ? `<p><strong>Phone:</strong> ${phone}</p>` : ""}

                <h3>Message</h3>

                <p>${message.replace(/\n/g, "<br>")}</p>
            `,
    });

    console.log(`Email sent for ${origin} to ${site.email}`);

    return res.json({
      success: true,
      message: "Message sent successfully",
    });
  } catch (error) {
    console.error("Contact form error:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to send message",
    });
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
  });
});

app.listen(PORT, () => {
  console.log(`Contact API running on port ${PORT}`);
});
