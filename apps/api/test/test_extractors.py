import io
import zipfile

import pytest
from PIL import Image

from app.extractors import extract_document, _check_zip_archive

def test_text_file_normalizes_line_endings():
    result = extract_document(b"first\r\nsecond", "book.txt")
    assert result.text == "first\nsecond"
    assert result.format == "txt"

def test_html_extraction_drops_scripts_and_navigation():
    result = extract_document(b"<html><body><h1>Story</h1><script>alert(1)</script><nav>menu</nav><p>Hello.</p></body></html>", "book.html")
    assert "Story" in result.text
    assert "Hello." in result.text
    assert "alert" not in result.text
    assert "menu" not in result.text

def test_invalid_archive_is_rejected_before_docx_or_epub_parser():
    with pytest.raises(ValueError, match="archive"):
        _check_zip_archive(b"not a zip")

def test_archive_expansion_limit_is_enforced():
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", "x" * (65 * 1024 * 1024))
    with pytest.raises(ValueError, match="safe processing limit"):
        _check_zip_archive(payload.getvalue())

def test_unsupported_extension_is_rejected():
    with pytest.raises(ValueError, match="Unsupported"):
        extract_document(b"hello", "thing.exe")



def test_image_ocr_uses_a_bounded_tesseract_timeout(monkeypatch):
    payload = io.BytesIO()
    Image.new("RGB", (32, 32), "white").save(payload, format="PNG")
    observed = {}

    def fake_ocr(image, timeout=None):
        observed["timeout"] = timeout
        return "A readable sentence."

    monkeypatch.setattr("app.extractors.pytesseract.image_to_string", fake_ocr)
    result = extract_document(payload.getvalue(), "scan.png")
    assert result.text == "A readable sentence."
    assert observed["timeout"] == 15
