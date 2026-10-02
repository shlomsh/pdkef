# Regenerates the encrypted fixtures next to this file (pypdf 6.x). Run from this folder:
#   python3 make-fixtures.py
# plain.pdf is a 3-page PDF with the text "hi 0", "hi 1", "hi 2" (one per page). Every file is checked by
# pdfEncryption.test.ts to really behave as named: a fixture meant to fail has to fail
# (docs/ux-design-guidelines.md section 14).
#   needs-password.pdf  AES-256, user password "u" (pdf.js rejects it with PasswordException)
#   owner-only.pdf      AES-256, empty user password, owner password set, permissions = print only
#   truncated.pdf       the first half of needs-password.pdf
from pypdf import PdfReader, PdfWriter
from pypdf.constants import UserAccessPermissions as P

writer = PdfWriter(clone_from=PdfReader("plain.pdf"))
writer.encrypt(user_password="u", owner_password="o", algorithm="AES-256")
writer.write("needs-password.pdf")

writer = PdfWriter(clone_from=PdfReader("plain.pdf"))
writer.encrypt(user_password="", owner_password="owner", algorithm="AES-256", permissions_flag=P.PRINT)
writer.write("owner-only.pdf")

data = open("needs-password.pdf", "rb").read()
open("truncated.pdf", "wb").write(data[: len(data) // 2])
