# PDkef for agents

PDkef (https://pdkef.com) is a set of free, open source PDF and image tools that run in the browser. Files are processed on the person's device and never uploaded. There is no API, account or file-upload endpoint, so the way to use it is to send the person to the right tool page, or open it for them, and let them choose their own file.

Tools: sign and fill, merge, split, edit pages, compress, compress image, redact, PDF to image, image to PDF, unlock/protect. Each has a page at https://pdkef.com/<tool>/.

- Which tool, and how to hand a person over: https://pdkef.com/.well-known/agent-skills/pdf-tools/SKILL.md
- Plain summary: https://pdkef.com/llms.txt
- In a browser with WebMCP, every page offers `list_pdf_tools` and `open_pdf_tool` on `navigator.modelContext`.
- Source code (MIT): https://github.com/shlomsh/pdkef
