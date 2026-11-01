from __future__ import annotations

import io
import zipfile

import fitz
import pytest
from docx import Document

from app import extractors
from app.extractors import extract_document


def test_docx_extraction_preserves_paragraphs_and_table_cells():
    document = Document()
    document.add_paragraph("Opening paragraph.")
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "Left cell"
    table.cell(0, 1).text = "Right cell"
    payload = io.BytesIO()
    document.save(payload)

    result = extract_document(payload.getvalue(), "sample.docx")

    assert "Opening paragraph." in result.text
    assert "Left cell | Right cell" in result.text
    assert result.format == "docx"


def test_pdf_page_limit_is_enforced_before_page_iteration():
    document = fitz.open()
    document.new_page()
    document.new_page()
    payload = document.tobytes()
    document.close()

    with pytest.raises(ValueError, match="2-page processing limit"):
        extract_document(payload, "sample.pdf", max_pdf_pages=1)


def test_encrypted_pdf_is_rejected():
    document = fitz.open()
    document.new_page()
    payload = document.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="owner", user_pw="reader")
    document.close()

    with pytest.raises(ValueError, match="Password-protected"):
        extract_document(payload, "locked.pdf")


def test_archive_entry_count_limit_is_enforced(monkeypatch):
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("one.xml", "one")
        archive.writestr("two.xml", "two")
    monkeypatch.setattr(extractors, "MAX_ARCHIVE_ENTRIES", 1)

    with pytest.raises(ValueError, match="too many entries"):
        extractors._check_zip_archive(payload.getvalue())


def test_archive_member_expansion_limit_is_enforced(monkeypatch):
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("large.xml", "x" * 128)
    monkeypatch.setattr(extractors, "MAX_ARCHIVE_MEMBER", 64)

    with pytest.raises(ValueError, match="entry exceeds"):
        extractors._check_zip_archive(payload.getvalue())


def test_extracted_text_limit_is_enforced(monkeypatch):
    monkeypatch.setattr(extractors, "MAX_EXTRACTED_CHARACTERS", 8)

    with pytest.raises(ValueError, match="8-million-character safety limit"):
        extract_document(b"123456789", "large.txt")


def test_malformed_pdf_returns_a_safe_validation_error():
    with pytest.raises(ValueError, match="PDF could not be opened"):
        extract_document(b"not a pdf", "broken.pdf")


def test_empty_epub_archive_is_rejected_before_epub_parser():
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("unrelated.txt", "not an EPUB")

    with pytest.raises(ValueError, match="EPUB container metadata is missing"):
        extract_document(payload.getvalue(), "not-a-book.epub")
