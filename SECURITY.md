# Security Policy

## Supported Versions

Only the latest release received active security updates.

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| < 0.4.0 | :x:                |

## Security Architecture

- **Local-first pipeline**: Detection, OCR, inpainting, and typesetting run entirely on your local machine using ONNX Runtime. No image data or project files are uploaded to external servers.
- **API key protection**: Translation API keys are stored in Lumina's local secrets vault encrypted via OS credential mechanisms (Windows DPAPI, macOS Keychain, Linux Secret Service). Plaintext API keys are never written to project files (`.lmi`) or logs.

## Reporting a Vulnerability

If you discover a security vulnerability in Lumina:

1. **Do not disclose it publicly.** Do not open a public issue.
2. Report the vulnerability privately via **GitHub Security Advisories** on the repository:
   - Go to the **Security** tab of the repository.
   - Click **Report a vulnerability**.
3. Alternatively, reach out directly to maintainers via private channels indicated on project profiles.

Provide:
- Clear description of the vulnerability.
- Steps to reproduce or proof-of-concept.
- Potential impact and affected platforms.

Maintainers will respond to acknowledged reports and provide fix timelines before public disclosure.
