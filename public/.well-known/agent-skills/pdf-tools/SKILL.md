---
name: pdf-tools
description: Send a person to the right free PDkef browser tool to sign, fill, merge, split, compress, redact, convert or unlock a PDF without uploading it.
---

# PDkef PDF tools

PDkef is a set of free, open source PDF and image tools that run entirely in the person's browser, on a phone or a computer. Files are processed on their device and never uploaded. There is no API, no account and no endpoint that accepts a file, so the way to use PDkef is to send the person to the right tool page, where they choose their own file.

## Pick the tool

- Fill in and sign a form, contract or consent slip: https://pdkef.com/sign/
- Combine several PDFs into one: https://pdkef.com/merge/
- Split a PDF or pull out some pages: https://pdkef.com/split/
- Reorder, rotate or delete pages, or add page numbers: https://pdkef.com/edit-pdf/
- Make a PDF smaller for an email or upload limit: https://pdkef.com/compress/
- Make a JPG or PNG smaller, for example under 100 KB: https://pdkef.com/compress-image/
- Black out, blur, white out or delete sensitive text or images: https://pdkef.com/redact/
- Turn PDF pages into images: https://pdkef.com/pdf-to-image/
- Combine JPG or PNG images into one PDF: https://pdkef.com/image-to-pdf/
- Remove or add a password on a PDF: https://pdkef.com/unlock/

## In a browser that supports WebMCP

Every page registers two tools on `navigator.modelContext`:

- `list_pdf_tools` returns each tool with a short description and its URL.
- `open_pdf_tool` takes a `tool` slug (`sign`, `merge`, `split`, `edit-pdf`, `compress`, `compress-image`, `redact`, `pdf-to-image`, `image-to-pdf`, `unlock`) and opens that tool for the person.

Both only discover and navigate. Never ask the person to paste a document into the chat to use PDkef: they pick the file on the tool page and it stays on their device.

## More

- Plain summary for agents: https://pdkef.com/llms.txt
- Every page also has a Markdown copy: add `.md` to the path, for example https://pdkef.com/sign.md
